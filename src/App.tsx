// src/App.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, mapDbToStudent, isSupabaseConfigured, runDbWrite, resolveStaffProfile, signOutAndForget } from './supabaseClient';
import type { Student, Staff, ParentReport, BiometricLog, ProgramType, AttendanceStatus, HeadInjuryLog } from './types';
import { GRADES, STUDENT_PHOTOS_ENABLED } from './constants';
import { INITIAL_STAFF, INITIAL_STUDENTS } from './utils/mockData';
import { sendSmsMock } from './utils/sms';
import { MockDatabase, PasskeyService } from './utils/mock';
import { playAlarm, uuidv4, formatClockTime, localDateIso } from './utils/helpers';
import { recordEvents, clearSessionEvents } from './services/auditLog';
import { setDbStudents, addDbStudent, removeDbStudent, isDbStudent, clearDbStudents } from './services/dbStudents';
import { persistCheckIn, persistUndoCheckIn, persistCheckOut, persistBatchCheckOut } from './services/attendanceWrites';
import Toast from './components/Toast';
import StaffLogin from './components/StaffLogin';
import StudentDetailModal from './components/StudentDetailModal';
import ConfirmationModal from './components/ConfirmationModal';
import LeaderDashboard from './components/LeaderDashboard';
import ParentReportModal from './components/ParentReportModal';
import GroupCheckInBar from './components/GroupCheckInBar';
import ConfirmDialog, { DOUBLE_TAP_GUARD_MS } from './components/ConfirmDialog';

const statusFor = (s: Student, p: ProgramType): AttendanceStatus => (p === 'sunrise' ? s.sunriseStatus : s.sunsetStatus);

/** "15-minute check · 2 symptoms noted" — for the event log. */
const headInjuryCheckDetail = (log: HeadInjuryLog): string => {
    const stage = log.stage === '0min' ? 'Initial check' : log.stage === '15min' ? '15-minute check' : '30-minute check';
    const symptoms = Object.values(log.symptoms || {}).filter(Boolean).length;
    return `${stage} · ${symptoms === 0 ? 'no symptoms noted' : `${symptoms} symptom${symptoms === 1 ? '' : 's'} noted`}`;
};

const fullName = (s: Student) => `${s.firstName} ${s.lastName}`;

/** The roster fields a check-in sets, for one program. */
const withCheckIn = (s: Student, p: ProgramType, time: string, staffName: string): Student => ({
    ...s,
    ...(p === 'sunrise'
        ? { sunriseStatus: 'present' as AttendanceStatus, sunriseTime: time, sunriseStaff: staffName }
        : { sunsetStatus: 'present' as AttendanceStatus, sunsetTime: time, sunsetStaff: staffName }),
    checkInSmsSent: true,
    checkInSmsTime: time,
});

/** Clears a check-in for one program (undo, or a write the database rejected). */
const withoutCheckIn = (s: Student, p: ProgramType): Student => ({
    ...s,
    ...(p === 'sunrise'
        ? { sunriseStatus: 'absent' as AttendanceStatus, sunriseTime: undefined, sunriseStaff: undefined }
        : { sunsetStatus: 'absent' as AttendanceStatus, sunsetTime: undefined, sunsetStaff: undefined }),
    checkInSmsSent: false,
    checkInSmsTime: undefined,
});

/** True while the student still shows exactly this device's check-in. */
const showsCheckIn = (s: Student, p: ProgramType, time: string, staffName: string) =>
    statusFor(s, p) === 'present'
    && (p === 'sunrise' ? s.sunriseTime : s.sunsetTime) === time
    && (p === 'sunrise' ? s.sunriseStaff : s.sunsetStaff) === staffName;

/** Sends arrival texts to the primary contact of each student checked in (simulated SMS). */
const sendArrivalTexts = (checkedIn: Student[], program: ProgramType, time: string, staffName: string) => {
    const programLabel = program === 'sunrise' ? 'Sunrise' : 'Sunset';
    checkedIn.forEach(s => {
        const contact1 = s.guardians.find(g => g.type === 'Contact 1');
        if (contact1?.phone) {
            sendSmsMock(contact1.phone, 'checkin_notification', { student_name: s.firstName, time, staff_name: staffName, program: programLabel });
        }
    });
};

/**
 * Tells the primary contact that an arrival text went out by mistake (simulated
 * SMS) — the arrival text itself can't be recalled. False if there's no number.
 */
const sendCorrectionText = (s: Student, program: ProgramType, time: string): boolean => {
    const contact1 = s.guardians.find(g => g.type === 'Contact 1');
    if (!contact1?.phone) return false;
    sendSmsMock(contact1.phone, 'checkin_correction', { student_name: s.firstName, time, program: program === 'sunrise' ? 'Sunrise' : 'Sunset' });
    return true;
};

const App = () => {
    const [staffList, setStaffList] = useState<Staff[]>(INITIAL_STAFF);
    const [user, setUser] = useState<Staff | null>(null);
    const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
    const [program, setProgram] = useState<ProgramType>('sunrise');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
    const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
    const [showConfirmId, setShowConfirmId] = useState<string | null>(null);
    const [showLeaderDashboard, setShowLeaderDashboard] = useState(false);
    const [dashboardKey, setDashboardKey] = useState(0);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'info' | 'warning' | 'error' } | null>(null);
    const [darkMode, setDarkMode] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [isLeadMode, setIsLeadMode] = useState(true);
    const [scheduledBatchCheckoutTime, setScheduledBatchCheckoutTime] = useState<string | null>(null);
    const [defaultBatchTime, setDefaultBatchTime] = useState<string>('08:00');
    const [isBatchDefaultEnabled, setIsBatchDefaultEnabled] = useState(false);
    const [reportData, setReportData] = useState<{ student: Student, type: 'injury' | 'behavior' } | null>(null);
    const [parentReports, setParentReports] = useState<ParentReport[]>([]);
    const [biometricLogs, setBiometricLogs] = useState<BiometricLog[]>([]);
    const [rosterStatusFilter, setRosterStatusFilter] = useState<'all' | 'checked_in' | 'checked_out'>('all');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isGroupMode, setIsGroupMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    /** Student whose check-in a Lead is about to undo (the "Are you sure?" dialog). */
    const [undoConfirmId, setUndoConfirmId] = useState<string | null>(null);
    /** Card whose "Tap to check in" was tapped: it now shows Confirm and cancel. */
    const [armedId, setArmedId] = useState<string | null>(null);
    const armedAtRef = useRef(0);
    /** The group check-in "Check in N students?" pop-out. */
    const [groupConfirmOpen, setGroupConfirmOpen] = useState(false);

    // Latest values for timers and async callbacks, which would otherwise close
    // over the render they were created in.
    const studentsRef = useRef(students);
    studentsRef.current = students;
    const checkInWriteRef = useRef<Promise<unknown> | null>(null);
    // Bumped on logout; delayed work (e.g. the sample check-out timer) checks it before writing.
    const sessionGenRef = useRef(0);
    // False right after an explicit logout, so a session-restore already in
    // flight cannot sign the person back in. (signOutAndForget also removes the
    // stored session, so a reload has nothing to restore.)
    const restoreSessionRef = useRef(true);

    // Load the roster from Supabase once per signed-in user. Only while signed
    // in: fetching during logout could reload real students with a session that
    // is still being torn down. This used to depend on staffList too, so toggling
    // a staff permission replaced the whole roster and dropped local additions.
    useEffect(() => {
        if (!isSupabaseConfigured || !user) return;
        let cancelled = false;
        const fetchInitialData = async () => {
            try {
                const { data, error } = await supabase.from('students').select('*');
                if (error) console.error('Error fetching students:', error.message);
                if (!cancelled && data && data.length > 0) {
                    setDbStudents(data.map((row: { id: string }) => row.id));
                    setStudents(data.map(mapDbToStudent));
                }
            } catch (err) {
                console.error('Fetch failed:', err);
            }
        };
        fetchInitialData();
        return () => { cancelled = true; };
    }, [user?.id]);

    // Keep `user` in step with the Supabase auth session: restore a saved session
    // on load, and drop the user when the session ends (e.g. signed out in another
    // tab). Signing in goes through StaffLogin, which resolves the staff profile —
    // the same lookup is used here, so a reload keeps the same name and role.
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        let cancelled = false;
        if (!user && restoreSessionRef.current) {
            supabase.auth.getSession().then(async ({ data: { session } }) => {
                if (!session?.user || cancelled) return;
                const profile = await resolveStaffProfile(session.user, staffList);
                // No profile = the lookup failed: stay on the login screen rather
                // than restoring the person with guessed permissions.
                if (profile && !cancelled && restoreSessionRef.current) setUser(profile);
            });
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') setUser(null);
        });

        return () => { cancelled = true; subscription.unsubscribe(); };
    }, [user, staffList]);

    // Supabase Realtime subscription
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        const channel = supabase
            .channel('students-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, (payload) => {
                if (payload.eventType === 'UPDATE' && payload.new) {
                    addDbStudent(payload.new.id);
                    setStudents(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...mapDbToStudent(payload.new) } : s));
                    setLastSyncTime(new Date());
                } else if (payload.eventType === 'DELETE' && payload.old) {
                    removeDbStudent(payload.old.id);
                    setStudents(prev => prev.filter(s => s.id !== payload.old.id));
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    // Program auto-switch based on time
    useEffect(() => {
        const checkTime = () => {
            const hour = new Date().getHours();
            setProgram(hour < 12 ? 'sunrise' : 'sunset');
        };
        checkTime();
        const interval = setInterval(checkTime, 60000);
        return () => clearInterval(interval);
    }, []);

    // Head injury timer alerts
    useEffect(() => {
        const interval = setInterval(() => {
            students.forEach(s => {
                if (s.headInjury && s.headInjuryStartTime) {
                    const elapsed = Number(Date.now()) - s.headInjuryStartTime;
                    const logsCount = s.headInjuryLogs.length;
                    const nextCheckMs = logsCount === 1 ? 15 * 60 * 1000 : logsCount === 2 ? 30 * 60 * 1000 : -1;
                    if (nextCheckMs !== -1 && Math.abs(nextCheckMs - elapsed) < 1000) {
                        showToast(`Time for ${s.firstName}'s next check!`, 'warning');
                        playAlarm();
                    }
                }
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [students]);

    // Dark mode detection
    useEffect(() => {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDarkMode(isDark);
        const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler);
        return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    // Batch checkout scheduler
    useEffect(() => {
        if (!scheduledBatchCheckoutTime || program !== 'sunrise') return;
        const interval = setInterval(() => {
            const now = new Date();
            const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            if (currentTime === scheduledBatchCheckoutTime) {
                const scheduled = scheduledBatchCheckoutTime;
                setScheduledBatchCheckoutTime(null);
                const isInBuilding = (s: Student) => s.sunriseStatus === 'present' || s.sunriseStatus === 'pending_parent';
                const checkOutLabel = `Auto-Check-Out at ${scheduled}`;
                const affected = studentsRef.current.filter(isInBuilding);
                const markOut = (ids: Set<string>) => setStudents(prev => prev.map(s =>
                    ids.has(s.id) && isInBuilding(s)
                        ? { ...s, sunriseStatus: 'checked_out' as AttendanceStatus, sunriseCheckOutTime: checkOutLabel }
                        : s));

                // Sample / session-only students change here; database students only
                // once the database confirms they were still in the building today.
                const local = affected.filter(s => !isDbStudent(s.id));
                const dbIds = affected.filter(s => isDbStudent(s.id)).map(s => s.id);
                markOut(new Set(local.map(s => s.id)));

                (async () => {
                    const rows = dbIds.length === 0 ? [] : await persistBatchCheckOut(dbIds, checkOutLabel, localDateIso(now));
                    const confirmed = new Set((rows ?? []).map(r => r.id));
                    markOut(confirmed);
                    const done = [...local, ...affected.filter(s => confirmed.has(s.id))];
                    const batchId = uuidv4();
                    const audit = await recordEvents(done.map(s => ({
                        studentId: s.id, studentName: fullName(s), type: 'checked_out', program: 'sunrise',
                        staffName: 'Scheduled batch checkout', batchId,
                        detail: `Sunrise batch checkout at ${scheduled} · ${done.length} students`,
                    })));
                    if (rows === null) {
                        showToast(`Batch checkout could not reach the database — ${dbIds.length} students are still checked in`, 'error');
                    } else if (audit.failed > 0) {
                        showToast(`Batch checkout done for ${done.length}, but the Program Log entries failed to save`, 'warning');
                    } else {
                        showToast(`Batch checkout executed at ${scheduled} · ${done.length} students`, 'success');
                    }
                })();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [scheduledBatchCheckoutTime, program]);

    const showToast = (msg: string, type: 'success' | 'info' | 'warning' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const filteredStudents = useMemo(() => {
        let result = students;
        if (user && user.role !== 'Lead' && user.assignedGrades && user.assignedGrades.length > 0) {
            result = result.filter(s => user.assignedGrades?.includes(s.grade));
        }
        if (rosterStatusFilter === 'checked_in') {
            result = result.filter(s => (program === 'sunrise' ? s.sunriseStatus : s.sunsetStatus) === 'present');
        } else if (rosterStatusFilter === 'checked_out') {
            result = result.filter(s => (program === 'sunrise' ? s.sunriseStatus : s.sunsetStatus) === 'checked_out');
        }
        if (selectedGrade && selectedGrade !== 'All') {
            result = result.filter(s => s.grade === selectedGrade);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(s => s.firstName.toLowerCase().includes(q) || s.lastName.toLowerCase().includes(q) || s.elopId.includes(q));
        }
        return result.sort((a, b) => {
            const gradeOrder = ['TK', 'K', '1', '2', '3', '4', '5'];
            const gradeIndexA = gradeOrder.indexOf(a.grade);
            const gradeIndexB = gradeOrder.indexOf(b.grade);
            if (gradeIndexA !== gradeIndexB) return gradeIndexA - gradeIndexB;
            const nameCompare = a.firstName.localeCompare(b.firstName);
            if (nameCompare !== 0) return nameCompare;
            return a.lastName.localeCompare(b.lastName);
        });
    }, [students, selectedGrade, searchQuery, program, user, rosterStatusFilter]);

    const currentStaffName = () => (user ? `${user.name} (${user.organization})` : 'Staff');

    const canCheckIn = () => {
        if (user && user.role !== 'Lead') {
            // The dashboard's live toggles live in staffList; staff loaded from the
            // database are not in it, so fall back to their own profile.
            const staffMember = staffList.find(s => s.id === user.id) ?? user;
            if (staffMember.canCheckIn === false) return false;
        }
        return true;
    };

    /** Lead (or admin) with Lead mode on — the same test the student page uses. */
    const isLeadView = !!user && (user.role === 'Lead' || !!user.canAdminTasks) && isLeadMode;

    /**
     * Checks in one student (a quick tap) or a whole group in one action.
     *
     * Every student gets the same timestamp and staff name, and the database gets
     * one conditional `update … in (ids)` that reports which rows it changed. The
     * board shows the check-in at once; for database students it is then kept or
     * rolled back by that answer. A child checked in on another device meanwhile,
     * or blocked since, is rolled back and reported, and only confirmed
     * check-ins are written to the Program Log and get an arrival text.
     * A check-in is final for staff; only a Lead can undo one (undoCheckIn).
     */
    const checkInStudents = async (requestedIds: string[]) => {
        if (!canCheckIn()) {
            showToast("You do not have permission to check-in students.", "error");
            return;
        }
        const p = program;
        const wanted = new Set(requestedIds);
        const eligible = studentsRef.current.filter(s => wanted.has(s.id) && statusFor(s, p) === 'absent' && !s.isCheckInBlocked);
        const skipped = wanted.size - eligible.length;
        if (eligible.length === 0) {
            showToast('No one to check in — already checked in or blocked', 'warning');
            return;
        }

        const now = new Date();
        const day = localDateIso(now);
        const time = formatClockTime(now);
        const staffName = currentStaffName();
        const isGroup = eligible.length > 1;
        const batchId = isGroup ? uuidv4() : undefined;
        const ids = new Set(eligible.map(s => s.id));

        setStudents(prev => prev.map(s => ids.has(s.id) && statusFor(s, p) === 'absent' ? withCheckIn(s, p, time, staffName) : s));
        setSelectedIds(new Set());
        setIsGroupMode(false);
        setSearchQuery('');

        const dbIds = eligible.filter(s => isDbStudent(s.id)).map(s => s.id);
        const write = persistCheckIn(dbIds, p, time, staffName, day);
        checkInWriteRef.current = write; // a Lead's undo must not overtake this write
        const { applied, complete } = await write;

        const rejected = new Set(dbIds.filter(id => !applied.has(id)));
        if (rejected.size > 0) {
            setStudents(prev => prev.map(s => rejected.has(s.id) && showsCheckIn(s, p, time, staffName) ? withoutCheckIn(s, p) : s));
        }

        const confirmed = eligible.filter(s => !rejected.has(s.id));
        sendArrivalTexts(confirmed, p, time, staffName);
        const audit = await recordEvents(confirmed.map(s => ({
            studentId: s.id, studentName: fullName(s), type: 'check_in', program: p, staffName,
            occurredAt: now.toISOString(), batchId,
            detail: !isGroup ? undefined
                : confirmed.length === eligible.length ? `Group check-in · ${eligible.length} students`
                : `Group check-in · ${confirmed.length} of ${eligible.length} selected`,
        })));

        if (!complete) {
            showToast(`${rejected.size} not checked in — couldn't reach the database`, 'error');
        } else if (rejected.size > 0) {
            showToast(`${rejected.size} not checked in — already checked in on another device, or blocked`, 'warning');
        } else if (audit.failed > 0) {
            showToast('Checked in, but the Program Log entry failed to save', 'warning');
        } else if (skipped > 0) {
            showToast(`${skipped} not checked in (already in or blocked)`, 'warning');
        }
    };

    /**
     * A Lead reverses one check-in from the roster card, after confirming.
     * A database student is reverted only if their row still carries exactly
     * this check-in (same day, time and staff), so a child checked out or checked
     * in again elsewhere meanwhile is left alone. The undo is itself recorded;
     * the original check-in stays on file. The arrival text has already gone
     * out, so the family gets a correction text.
     */
    const undoCheckIn = async (studentId: string) => {
        setUndoConfirmId(null);
        if (!isLeadView) return;
        const p = program;
        const student = studentsRef.current.find(s => s.id === studentId);
        if (!student || statusFor(student, p) !== 'present') return;
        const time = (p === 'sunrise' ? student.sunriseTime : student.sunsetTime) ?? '';
        const staffName = (p === 'sunrise' ? student.sunriseStaff : student.sunsetStaff) ?? '';

        if (isDbStudent(studentId)) {
            // Two separate requests can arrive out of order; let a check-in still
            // in flight land first so the revert is the last write.
            await checkInWriteRef.current;
            const rows = await persistUndoCheckIn([studentId], p, time, staffName, localDateIso());
            if (rows === null) {
                showToast(`Undo couldn't reach the database — ${student.firstName} is still checked in`, 'error');
                return;
            }
            if (rows.length === 0) {
                showToast(`Not undone — ${student.firstName}'s check-in was changed on another device`, 'warning');
                return;
            }
        }

        setStudents(prev => prev.map(s => s.id === studentId && showsCheckIn(s, p, time, staffName) ? withoutCheckIn(s, p) : s));
        const texted = sendCorrectionText(student, p, time);
        const audit = await recordEvents([{
            studentId, studentName: fullName(student), type: 'check_in_undone', program: p,
            staffName: currentStaffName(),
            detail: `Reverses the ${time} check-in by ${staffName} · undone by the Lead · ${texted ? 'correction text to family (guardian texts not connected)' : 'no family phone on file for a correction text'}`,
        }]);
        if (audit.failed > 0) showToast('Undone, but the Program Log entry failed to save', 'warning');
        else showToast(`Check-in undone for ${student.firstName} · ${texted ? 'correction text sent to family' : 'no family phone on file'}`, 'info');
    };

    const exitGroupMode = () => {
        setIsGroupMode(false);
        setSelectedIds(new Set());
        setGroupConfirmOpen(false);
    };

    const toggleGroupMode = () => {
        if (isGroupMode) { exitGroupMode(); return; }
        if (!canCheckIn()) {
            showToast("You do not have permission to check-in students.", "error");
            return;
        }
        setIsGroupMode(true);
    };

    const toggleSelected = (student: Student) => {
        if (student.isCheckInBlocked) {
            showToast(`${student.firstName} is blocked from check-in. Contact Lead.`, 'error');
            return;
        }
        if (statusFor(student, program) !== 'absent') return;
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(student.id)) next.delete(student.id);
            else next.add(student.id);
            return next;
        });
    };

    // Esc leaves group mode on Chromebooks/desktops (or, with the pop-out open, just closes that).
    useEffect(() => {
        if (!isGroupMode || groupConfirmOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitGroupMode(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isGroupMode, groupConfirmOpen]);

    // An armed card goes back to "Tap to check in" on Esc, or when the list,
    // program or mode changes underneath it.
    useEffect(() => { setArmedId(null); }, [program, searchQuery, selectedGrade, rosterStatusFilter, isGroupMode]);
    useEffect(() => {
        if (!armedId) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setArmedId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [armedId]);

    /** First tap on "Tap to check in": show Confirm and cancel instead. */
    const armCheckIn = (id: string) => {
        if (armedId === id) return; // a tap on the card itself never confirms
        armedAtRef.current = Date.now();
        setArmedId(id);
    };

    /** Confirm on an armed card. A tap right after arming is a double-tap, not a decision. */
    const confirmCheckIn = (id: string) => {
        if (Date.now() - armedAtRef.current < DOUBLE_TAP_GUARD_MS) return;
        setArmedId(null);
        checkInStudents([id]);
    };

    const eligibleVisible = useMemo(
        () => filteredStudents.filter(s => statusFor(s, program) === 'absent' && !s.isCheckInBlocked),
        [filteredStudents, program],
    );
    const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every(s => selectedIds.has(s.id));
    // Someone else may check a selected student in meanwhile — count only who is still eligible.
    const selectedEligible = useMemo(
        () => students.filter(s => selectedIds.has(s.id) && statusFor(s, program) === 'absent' && !s.isCheckInBlocked),
        [students, selectedIds, program],
    );
    const selectedEligibleCount = selectedEligible.length;
    const toggleSelectAllVisible = () => setSelectedIds(prev => {
        const next = new Set(prev);
        if (allVisibleSelected) eligibleVisible.forEach(s => next.delete(s.id));
        else eligibleVisible.forEach(s => next.add(s.id));
        return next;
    });

    /**
     * Tap on a roster card (`intent: 'tap'`) or its ⋮ button (`'details'`).
     * In group mode a tap selects; otherwise a tap on an absent student shows
     * Confirm / cancel on their card, and only Confirm checks them in.
     * ⋮ always opens the student's details and never checks anyone in.
     */
    const handleStudentAction = (student: Student, intent: 'tap' | 'details' = 'tap') => {
        if (isGroupMode && intent === 'tap') {
            toggleSelected(student);
            return;
        }
        if (!canCheckIn()) {
            showToast("You do not have permission to check-in students.", "error");
            return;
        }
        const latestStudent = students.find(s => s.id === student.id) || student;
        if (intent === 'details' || statusFor(latestStudent, program) !== 'absent') {
            setActiveStudentId(student.id);
            return;
        }
        if (latestStudent.isCheckInBlocked) {
            showToast("This student is blocked from check-in. Contact Lead.", "error");
            return;
        }
        if (STUDENT_PHOTOS_ENABLED) {
            setShowConfirmId(student.id);
        } else {
            armCheckIn(student.id);
        }
    };

    /** Photo/face-verification check-in — only reachable when STUDENT_PHOTOS_ENABLED. */
    const handleCheckIn = async (studentId: string, photo?: string, biometricData?: any) => {
        const now = new Date();
        const timeString = formatClockTime(now);
        const staffName = currentStaffName();

        setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
                const update = program === 'sunrise'
                    ? { sunriseStatus: 'present' as AttendanceStatus, sunriseTime: timeString, sunriseStaff: staffName }
                    : { sunsetStatus: 'present' as AttendanceStatus, sunsetTime: timeString, sunsetStaff: staffName };
                return { ...s, ...update, checkInPhoto: photo, checkInSmsSent: true, checkInSmsTime: timeString };
            }
            return s;
        }));

        const student = students.find(s => s.id === studentId);
        if (student) {
            const contact1 = student.guardians.find(g => g.type === 'Contact 1');
            if (contact1?.phone) {
                sendSmsMock(contact1.phone, 'checkin_notification', { student_name: student.firstName, time: timeString, staff_name: staffName, program: program.charAt(0).toUpperCase() + program.slice(1) });
            }
        }

        if (isDbStudent(studentId)) {
            // The photo stays on this device. The schema stores image URLs only,
            // never raw image data, so checkin_photo is not written here.
            const { applied, complete } = await persistCheckIn([studentId], program, timeString, staffName, localDateIso(now));
            if (!applied.has(studentId)) {
                setStudents(prev => prev.map(s => s.id === studentId && showsCheckIn(s, program, timeString, staffName) ? withoutCheckIn(s, program) : s));
                showToast(!complete ? "Not checked in — couldn't reach the database" : 'Not checked in — already checked in on another device, or blocked', !complete ? 'error' : 'warning');
                setShowConfirmId(null);
                return;
            }
        }
        if (student) {
            const audit = await recordEvents([{ studentId, studentName: fullName(student), type: 'check_in', program, staffName, occurredAt: now.toISOString(), detail: photo ? 'Photo captured at check-in' : undefined }]);
            if (audit.failed > 0) showToast('Checked in, but the Program Log entry failed to save', 'warning');
        }

        if (student) {
            showToast(`Checked-In: ${student.firstName}`, 'success');
            if (biometricData) {
                const mockPhotos = MockDatabase.getPhotosForStudent(student);
                const newLog: BiometricLog = {
                    id: Date.now().toString(),
                    studentId,
                    studentName: `${student.firstName} ${student.lastName}`,
                    timestamp: new Date().toLocaleString(),
                    matchScore: 0.92,
                    anomalyScore: biometricData.anomalyScore,
                    anomalyDetected: biometricData.visualAnomalyDetected,
                    livePhoto: photo || '',
                    yearbookPhoto: student.yearbookPhotoUrl || mockPhotos.yearbook,
                    previousPhoto: student.lastCheckInPhoto || mockPhotos.previous
                };
                setBiometricLogs(prev => [newLog, ...prev]);
                if (biometricData.visualAnomalyDetected) {
                    showToast('Visual Anomaly Detected - Review in dashboard', 'warning');
                }
                PasskeyService.uploadToDrive(photo || '', studentId);
            }
        }
        setShowConfirmId(null);
        setSearchQuery('');
    };

    /**
     * Check-out after a staff member confirms who is picking the child up.
     * Resolves true if the check-out went ahead.
     *
     * Database students: the staff member's confirmation at the door IS the
     * check-out — written once, only if the child is still checked in today, and
     * recorded with who they were released to. (A simulated 5-second "guardian
     * replied" timer used to complete real check-outs; there is no SMS provider
     * yet, so nothing real was confirming them.)
     *
     * Sample / session-only students keep the demo of the guardian-text round
     * trip, clearly labelled as simulated.
     */
    const handleCheckOut = async (studentId: string, smsTime: string, checkOutBy?: string, releasedTo?: string): Promise<boolean> => {
        const p = program;
        const student = studentsRef.current.find(s => s.id === studentId);
        if (!student) return false;
        const staffName = checkOutBy || currentStaffName();

        if (isDbStudent(studentId)) {
            const time = formatClockTime();
            const rows = await persistCheckOut(studentId, p, time, staffName, smsTime, localDateIso());
            if (!rows || rows.length === 0) {
                showToast(rows === null
                    ? "Check-out not saved — couldn't reach the database"
                    : `${student.firstName} is no longer checked in on the database — refresh the roster`, 'error');
                return false;
            }
            setStudents(prev => prev.map(s => s.id === studentId
                ? { ...s, ...(p === 'sunrise'
                    ? { sunriseStatus: 'checked_out' as AttendanceStatus, sunriseCheckOutTime: time }
                    : { sunsetStatus: 'checked_out' as AttendanceStatus, sunsetCheckOutTime: time }),
                    smsSentTime: smsTime, lastCheckOutBy: staffName }
                : s));
            const audit = await recordEvents([{
                studentId, studentName: fullName(student), type: 'checked_out', program: p, staffName,
                detail: `Released to ${releasedTo || 'guardian'} · confirmed by staff at pickup (guardian texts not connected)`,
            }]);
            if (audit.failed > 0) showToast('Checked out, but the Program Log entry failed to save', 'warning');
            return true;
        }

        // Sample / session-only student: demo of the guardian confirming by text.
        setStudents(prev => prev.map(s => s.id === studentId
            ? { ...s, ...(p === 'sunrise' ? { sunriseStatus: 'pending_parent' as AttendanceStatus } : { sunsetStatus: 'pending_parent' as AttendanceStatus }), smsSentTime: smsTime, lastCheckOutBy: staffName }
            : s));
        recordEvents([{ studentId, studentName: fullName(student), type: 'checkout_requested', program: p, staffName, detail: `Pickup by ${releasedTo || 'guardian'} · guardian text simulated (sample data)` }]);
        const gen = sessionGenRef.current;
        setTimeout(() => {
            if (sessionGenRef.current !== gen) return; // logged out meanwhile
            const timeString = formatClockTime();
            setStudents(prev => prev.map(s => s.id === studentId && statusFor(s, p) === 'pending_parent'
                ? { ...s, ...(p === 'sunrise' ? { sunriseStatus: 'checked_out' as AttendanceStatus, sunriseCheckOutTime: timeString } : { sunsetStatus: 'checked_out' as AttendanceStatus, sunsetCheckOutTime: timeString }) }
                : s));
            recordEvents([{ studentId, studentName: fullName(student), type: 'checked_out', program: p, staffName, detail: 'Guardian confirmation simulated (sample data)' }]);
        }, 5000);
        return true;
    };

    const handleSaveStudent = async (updatedStudent: Student) => {
        const oldStudent = students.find(s => s.id === updatedStudent.id);
        setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));

        if (isDbStudent(updatedStudent.id)) {
            const updateData: any = {
                first_name: updatedStudent.firstName,
                last_name: updatedStudent.lastName,
                grade: updatedStudent.grade,
                elop_id: updatedStudent.elopId,
                ases_id: updatedStudent.asesId,
                guardians: updatedStudent.guardians,
                programs: updatedStudent.programs,
                has_snack: updatedStudent.hasSnack,
                behavior: updatedStudent.behavior,
                behavior_issues: updatedStudent.behaviorIssues,
                // These columns existed (and were read back) but were never
                // written, so after a reload a ticket lost its time, staff and notes.
                behavior_timestamp: updatedStudent.behaviorTimestamp ?? null,
                behavior_staff: updatedStudent.behaviorStaff ?? null,
                behavior_description: updatedStudent.behaviorDescription ?? null,
                head_injury: updatedStudent.headInjury,
                head_injury_logs: updatedStudent.headInjuryLogs,
            };
            // supabase-js reports most failures in `error` rather than throwing, so
            // the old try/catch alone never saw a rejected update; runDbWrite
            // handles both.
            const saved = await runDbWrite('Save student', () => supabase.from('students').update(updateData).eq('id', updatedStudent.id));
            if (!saved) showToast('Failed to save changes to DB', 'error');
        }

        // Auto-create head injury report draft
        if (oldStudent && !oldStudent.headInjury && updatedStudent.headInjury) {
            const headInjuryReport: ParentReport = {
                id: Date.now().toString(),
                studentId: updatedStudent.id,
                studentName: `${updatedStudent.firstName} ${updatedStudent.lastName}`,
                type: 'injury',
                message: `HEAD INJURY REPORT\n\nStudent: ${updatedStudent.firstName} ${updatedStudent.lastName}\nDate/Time: ${new Date().toLocaleString()}`,
                method: 'both',
                status: 'draft',
                createdAt: new Date().toISOString(),
                staffId: user?.id || 'unknown'
            };
            setParentReports(prev => [...prev, headInjuryReport]);
            showToast('Head Injury draft created', 'info');
            const first = updatedStudent.headInjuryLogs.find(l => l.stage === '0min');
            recordEvents([{ studentId: updatedStudent.id, studentName: fullName(updatedStudent), type: 'head_injury_started', program, staffName: currentStaffName(), detail: first ? headInjuryCheckDetail(first) : undefined }]);
        }

        // Follow-up head-injury checks (the initial check is part of "started" above).
        if (oldStudent && updatedStudent.headInjury) {
            const before = new Set((oldStudent.headInjuryLogs || []).map(l => l.stage));
            const added = updatedStudent.headInjuryLogs.filter(l => l.stage !== '0min' && !before.has(l.stage));
            if (added.length > 0) {
                recordEvents(added.map(l => ({
                    studentId: updatedStudent.id, studentName: fullName(updatedStudent), type: 'head_injury_check' as const, program,
                    staffName: currentStaffName(), detail: headInjuryCheckDetail(l),
                })));
            }
        }

        // We Care report submitted or edited (each save stamps a new weCareSubmittedAt).
        if (oldStudent && updatedStudent.weCareSubmittedAt && updatedStudent.weCareSubmittedAt !== oldStudent.weCareSubmittedAt) {
            const firstAid = updatedStudent.weCareFirstAid || [];
            recordEvents([{
                studentId: updatedStudent.id, studentName: fullName(updatedStudent), type: 'we_care_submitted', program,
                staffName: currentStaffName(),
                detail: [oldStudent.weCareSubmittedAt ? 'Edited' : '', updatedStudent.weCareActivity, firstAid.length > 0 ? `first aid: ${firstAid.join(', ')}` : '']
                    .filter(Boolean).join(' · ') || undefined,
            }]);
        }

        // Auto-create behavior report draft when ticket is SUBMITTED (not just when behavior selected)
        const behaviorJustSubmitted = oldStudent && !oldStudent.behaviorSubmittedAt && updatedStudent.behaviorSubmittedAt;
        if (behaviorJustSubmitted) {
            const behaviorLabelMap: Record<string, string> = { green: 'Level 1 (Green)', yellow: 'Level 2 (Yellow)', red: 'Level 3 (Red)' };
            const ticketLevel = behaviorLabelMap[updatedStudent.behavior as string] || updatedStudent.behavior;
            const behaviorList = (updatedStudent.behaviorIssues || []).length > 0
                ? updatedStudent.behaviorIssues.map((b: string) => `• ${b}`).join('\n')
                : '• General behavior concern';
            const behaviorMessage = [
                `BEHAVIOR REPORT`,
                ``,
                `Student: ${updatedStudent.firstName} ${updatedStudent.lastName}`,
                `Date: ${new Date().toLocaleDateString()}`,
                `Time: ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
                `Ticket Level: ${ticketLevel}`,
                `Handling Staff: ${updatedStudent.behaviorStaff || 'EDP Staff'}`,
                `Staff Closest to Situation: ${updatedStudent.behaviorStaffSupport || 'N/A'}`,
                ``,
                `Checked Behaviors:`,
                behaviorList,
                ``,
                `Details of the Incident:`,
                updatedStudent.behaviorDescription || 'No details provided.',
                ``,
                `Actions Taken by Staff:`,
                updatedStudent.behaviorActions || 'No actions recorded.',
            ].join('\n');
            const behaviorReport: ParentReport = {
                id: Date.now().toString(),
                studentId: updatedStudent.id,
                studentName: `${updatedStudent.firstName} ${updatedStudent.lastName}`,
                type: 'behavior',
                message: behaviorMessage,
                method: 'both',
                status: 'draft',
                createdAt: new Date().toISOString(),
                staffId: user?.id || 'unknown'
            };
            setParentReports(prev => [...prev, behaviorReport]);
            showToast('Behavior report draft created', 'info');
            const issueCount = (updatedStudent.behaviorIssues || []).length;
            recordEvents([{
                studentId: updatedStudent.id, studentName: fullName(updatedStudent), type: 'behavior_submitted', program,
                staffName: currentStaffName(), detail: `${ticketLevel} · ${issueCount} behavior${issueCount === 1 ? '' : 's'} noted`,
            }]);
        }
    };

    const handleLogout = () => {
        exitGroupMode();
        setUndoConfirmId(null);
        setArmedId(null);
        setGroupConfirmOpen(false);
        sessionGenRef.current += 1; // late timers from this session must not touch the next one
        // Without a real sign-out the Supabase session survived "Logout" and the
        // previous staff member was signed straight back in, on this page or after
        // a reload — on a shared site Chromebook the next person inherited their
        // identity. signOutAndForget also removes the stored session when Supabase
        // can't be reached.
        restoreSessionRef.current = false;
        if (isSupabaseConfigured) void signOutAndForget();
        // Student data loaded for one person must not stay on screen or in memory
        // for whoever uses the device next.
        setStudents(INITIAL_STUDENTS);
        setStaffList(INITIAL_STAFF);
        setParentReports([]);
        setBiometricLogs([]);
        setScheduledBatchCheckoutTime(null);
        setActiveStudentId(null);
        setShowConfirmId(null);
        setShowLeaderDashboard(false);
        setReportData(null);
        setSearchQuery('');
        setSelectedGrade(null);
        clearDbStudents();
        clearSessionEvents();
        setUser(null);
    };

    const handleLogin = (staff: Staff) => {
        restoreSessionRef.current = true;
        setUser(staff);
    };

    if (!user) return <StaffLogin onLogin={handleLogin} onToggleDemo={() => setIsDemoMode(!isDemoMode)} isDemoMode={isDemoMode} staffList={staffList} />;

    const activeStudent = students.find(s => s.id === activeStudentId);
    const confirmStudent = students.find(s => s.id === showConfirmId);
    // Closes by itself if the child is checked out (or the check-in undone) elsewhere meanwhile.
    const undoStudent = isLeadView ? students.find(s => s.id === undoConfirmId && statusFor(s, program) === 'present') : undefined;

    return (
        <>
            <div className="sticky-header" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '80px', zIndex: 9999, backgroundColor: 'var(--bg-app)', paddingTop: 'env(safe-area-inset-top)', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                <header style={{ backgroundColor: 'var(--bg-header)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', width: '100%', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: program === 'sunrise' ? 'var(--color-sunrise)' : 'var(--color-sunset)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>{program === 'sunrise' ? 'wb_sunny' : 'nights_stay'}</span>
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>{program === 'sunrise' ? 'Sunrise' : 'Sunset'} {isDemoMode && <span style={{ fontSize: '10px', color: '#8b5cf6' }}>DEMO</span>}</h1>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div onClick={() => setIsLeadMode(!isLeadMode)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '16px', backgroundColor: isLeadMode ? 'rgba(139,92,246,0.1)' : 'var(--bg-hover)', border: `1px solid ${isLeadMode ? '#8b5cf6' : 'var(--border-subtle)'}`, cursor: 'pointer' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px', color: isLeadMode ? '#8b5cf6' : 'var(--text-secondary)' }}>{isLeadMode ? 'admin_panel_settings' : 'person'}</span>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: isLeadMode ? '#8b5cf6' : 'var(--text-secondary)' }}>{isLeadMode ? 'LEAD' : 'STAFF'}</span>
                        </div>
                        <button onClick={() => { setActiveStudentId(null); setShowLeaderDashboard(false); setShowConfirmId(null); setReportData(null); exitGroupMode(); }} style={{ padding: '6px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Home">
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>home</span>
                        </button>
                        {isLeadMode && (
                            <button onClick={() => { exitGroupMode(); setShowLeaderDashboard(true); setDashboardKey(prev => prev + 1); }} style={{ padding: '6px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Dashboard">
                                <span className="material-icons-round" style={{ fontSize: '20px' }}>dashboard</span>
                            </button>
                        )}
                        <button onClick={() => setDarkMode(!darkMode)} style={{ padding: '6px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Toggle Theme">
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>{darkMode ? 'light_mode' : 'dark_mode'}</span>
                        </button>
                        <button onClick={handleLogout} style={{ padding: '6px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-danger)', cursor: 'pointer' }} title="Logout">
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>logout</span>
                        </button>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#374151', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>{user.name.charAt(0)}</div>
                    </div>
                </header>
            </div>

            <main style={{ paddingTop: '80px', flex: 1, overflowY: 'auto', paddingBottom: '100px', height: '100%' }}>
                {!showLeaderDashboard && (
                    <div style={{ padding: '16px', backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '16px', position: 'sticky', top: 0, zIndex: 900 }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {['all', 'checked_in', 'checked_out'].map(tab => (
                                <button key={tab} onClick={() => setRosterStatusFilter(tab as any)} style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: 'none', backgroundColor: rosterStatusFilter === tab ? 'var(--text-main)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'), color: rosterStatusFilter === tab ? 'var(--bg-card)' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'), fontWeight: '800', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {tab === 'all' ? 'All Students' : tab === 'checked_in' ? 'Checked-In' : 'Checked-Out'}
                                </button>
                            ))}
                        </div>
                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                            <span className="material-icons-round" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: darkMode ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)', fontSize: '20px' }}>search</span>
                            <input type="text" placeholder="Search student..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: '16px', border: 'none', backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#f3f4f6', fontSize: '16px', color: darkMode ? 'white' : 'var(--text-main)', boxSizing: 'border-box', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {GRADES.map(g => (
                                <button key={g} onClick={() => setSelectedGrade(prev => prev === g ? 'All' : g)} style={{ padding: '10px 16px', borderRadius: '12px', border: 'none', backgroundColor: selectedGrade === g ? 'var(--text-main)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'), color: selectedGrade === g ? 'var(--bg-card)' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'), fontWeight: '800', fontSize: '14px', cursor: 'pointer', minWidth: '48px', transition: 'all 0.2s' }}>{g}</button>
                            ))}
                            <button
                                onClick={toggleGroupMode}
                                aria-pressed={isGroupMode}
                                title="Select several students and check them in together"
                                style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: '12px', border: 'none', backgroundColor: isGroupMode ? 'var(--color-primary)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'), color: isGroupMode ? 'white' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'), fontWeight: '800', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>{isGroupMode ? 'close' : 'group_add'}</span>
                                {isGroupMode ? 'Cancel group' : 'Select group'}
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ paddingTop: '16px' }}>
                    {filteredStudents.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <span className="material-icons-round" style={{ fontSize: '64px', marginBottom: '16px' }}>school</span>
                            <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Students Found</div>
                            <div style={{ fontSize: '14px' }}>Try adjusting your search or filters</div>
                        </div>
                    ) : (
                        filteredStudents.map(student => {
                            const status = statusFor(student, program);
                            const isPresent = status === 'present';
                            const isCheckedOut = status === 'checked_out' || status === 'pending_parent';
                            const isAbsent = status === 'absent';
                            const isSelectable = isAbsent && !student.isCheckInBlocked;
                            const isSelected = isGroupMode && selectedIds.has(student.id);
                            const onActivate = () => { if (isAbsent) handleStudentAction(student); };
                            return (
                                <div
                                    key={student.id}
                                    className="student-card"
                                    role={isAbsent ? 'button' : undefined}
                                    tabIndex={isAbsent ? 0 : undefined}
                                    aria-pressed={isGroupMode && isAbsent ? isSelected : undefined}
                                    aria-label={isAbsent ? `${isGroupMode ? 'Select' : 'Check in'} ${fullName(student)}` : undefined}
                                    onClick={onActivate}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } }}
                                    // The selection tint is layered over the card colour: a translucent
                                    // background alone let a light page show through in dark mode.
                                    style={{ background: isSelected ? 'linear-gradient(rgba(59,130,246,0.18), rgba(59,130,246,0.18)), var(--bg-card)' : 'var(--bg-card)', padding: '16px', borderRadius: '16px', marginBottom: '12px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${isSelected ? 'var(--color-primary)' : isPresent || isCheckedOut ? (status === 'checked_out' ? '#9ca3af' : '#10b981') : 'transparent'}`, cursor: isAbsent ? 'pointer' : 'default', opacity: student.isCheckInBlocked ? 0.5 : (isGroupMode && !isSelectable ? 0.55 : 1) }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--text-secondary)' }}>{student.grade}</div>
                                        <div>
                                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>{student.firstName} {student.lastName}</div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {student.programs.includes('ELOP') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '700' }}>ELOP</span>}
                                                {student.programs.includes('ASES') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#6b21a8', fontWeight: '700' }}>ASES</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {student.headInjury && <span className="material-icons-round" style={{ color: '#ef4444' }}>personal_injury</span>}
                                        {student.behavior !== 'none' && <span className="material-icons-round" style={{ color: '#10b981' }}>warning</span>}
                                        {isAbsent ? (
                                            isGroupMode ? (
                                                <span className="material-icons-round" style={{ color: isSelected ? 'var(--color-primary)' : 'var(--text-muted)', fontSize: '26px' }}>
                                                    {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                                                </span>
                                            ) : student.isCheckInBlocked ? (
                                                <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-danger)', textTransform: 'uppercase' }}>Blocked</span>
                                            ) : armedId === student.id ? (
                                                // The first tap only armed the card; checking in takes Confirm.
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button
                                                        title="Cancel"
                                                        aria-label={`Cancel check-in for ${fullName(student)}`}
                                                        onClick={e => { e.stopPropagation(); setArmedId(null); }}
                                                        onKeyDown={e => e.stopPropagation()}
                                                        style={{ width: '36px', height: '36px', padding: 0, borderRadius: '50%', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '20px' }}>undo</span>
                                                    </button>
                                                    <button
                                                        autoFocus
                                                        aria-label={`Confirm check-in for ${fullName(student)}`}
                                                        onClick={e => { e.stopPropagation(); confirmCheckIn(student.id); }}
                                                        onKeyDown={e => e.stopPropagation()}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 14px', borderRadius: '999px', border: 'none', backgroundColor: 'var(--color-success)', color: 'white', fontSize: '13px', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '16px' }}>check</span> Confirm
                                                    </button>
                                                </div>
                                            ) : (
                                                <span style={{ padding: '6px 12px', borderRadius: '999px', border: '1px dashed var(--text-muted)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                                    Tap to check in
                                                </span>
                                            )
                                        ) : (
                                            <div style={{ textAlign: 'right' }}>
                                                {/* Check-ins are final for staff. A Lead's Undo sits where the check-in button was, and asks first. */}
                                                {isPresent && isLeadView && !isGroupMode && (
                                                    <button
                                                        aria-label={`Undo check-in for ${fullName(student)}`}
                                                        onClick={e => { e.stopPropagation(); setArmedId(null); setUndoConfirmId(student.id); }}
                                                        onKeyDown={e => e.stopPropagation()}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '4px', padding: '4px 10px', borderRadius: '999px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '15px' }}>undo</span> Undo
                                                    </button>
                                                )}
                                                <div style={{ fontSize: '12px', fontWeight: '700', color: status === 'checked_out' ? '#9ca3af' : status === 'pending_parent' ? '#8b5cf6' : '#10b981', textTransform: 'uppercase' }}>
                                                    {status === 'checked_out' ? 'CHECKED-OUT' : status === 'pending_parent' ? 'WAITING' : 'CHECKED-IN'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                    {status === 'checked_out'
                                                        ? `${program === 'sunrise' ? student.sunriseCheckOutTime : student.sunsetCheckOutTime} by ${program === 'sunrise' ? (student.sunriseStaff || 'Staff') : (student.sunsetStaff || 'Staff')}`
                                                        : `${program === 'sunrise' ? student.sunriseTime : student.sunsetTime} by ${program === 'sunrise' ? (student.sunriseStaff || 'Staff') : (student.sunsetStaff || 'Staff')}`
                                                    }
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            {STUDENT_PHOTOS_ENABLED && (isPresent || isCheckedOut) && (
                                                <>
                                                    {student.checkInPhoto && (
                                                        <img src={student.checkInPhoto} alt="Check-in" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #8b5cf6', objectFit: 'cover' }} />
                                                    )}
                                                    {student.yearbookPhotoUrl && (
                                                        <img src={student.yearbookPhotoUrl} alt="Yearbook" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--border-subtle)', objectFit: 'cover' }} />
                                                    )}
                                                </>
                                            )}
                                            <button title="Student details" aria-label={`Details for ${fullName(student)}`} onClick={(e) => { e.stopPropagation(); handleStudentAction(student, 'details'); }} onKeyDown={e => e.stopPropagation()} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-icons-round">more_vert</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </main>

            {showConfirmId && confirmStudent && createPortal(
                <ConfirmationModal student={confirmStudent} title="Check-In?" message={`Mark ${confirmStudent.firstName} as present?`} onConfirm={(photo, biometricData) => handleCheckIn(confirmStudent.id, photo, biometricData)} onCancel={() => setShowConfirmId(null)} showPhotoOption={true} isDemoMode={isDemoMode} darkMode={darkMode} />,
                document.body
            )}

            {activeStudentId && activeStudent && createPortal(
                <div style={{ position: 'fixed', top: '80px', left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: 'var(--bg-app)', overflowY: 'auto' }}>
                    <StudentDetailModal student={activeStudent} onClose={() => setActiveStudentId(null)} onSave={handleSaveStudent} onCheckOut={handleCheckOut} currentStaff={user} program={program} isLeadMode={isLeadMode} darkMode={darkMode} onUpdateReport={(report) => setParentReports(prev => [...prev, report])} showToast={showToast} staffList={staffList} parentReports={parentReports} />
                </div>,
                document.body
            )}

            {showLeaderDashboard && createPortal(
                <div key={dashboardKey} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-app)', zIndex: 2000 }}>
                    <LeaderDashboard user={user} students={students} staffList={staffList} parentReports={parentReports} biometricLogs={biometricLogs} onClose={() => setShowLeaderDashboard(false)} onImport={(newStudents) => setStudents(prev => [...prev, ...newStudents])} onAddStudent={(newStudent) => setStudents(prev => [...prev, newStudent])} onUpdateStaff={(updatedStaff) => setStaffList(updatedStaff)} onUpdateStudent={handleSaveStudent} onUpdateReport={(updatedReport) => setParentReports(prev => prev.some(r => r.id === updatedReport.id) ? prev.map(r => r.id === updatedReport.id ? updatedReport : r) : [...prev, updatedReport])} onDeleteReport={(reportId) => setParentReports(prev => prev.filter(r => r.id !== reportId))} onScheduleBatchCheckout={(time) => setScheduledBatchCheckoutTime(time)} showToast={showToast} isBatchDefaultEnabled={isBatchDefaultEnabled} setIsBatchDefaultEnabled={setIsBatchDefaultEnabled} defaultBatchTime={defaultBatchTime} setDefaultBatchTime={setDefaultBatchTime} scheduledBatchCheckoutTime={scheduledBatchCheckoutTime} darkMode={darkMode} />
                </div>,
                document.body
            )}

            {reportData && (
                <ParentReportModal student={reportData.student} type={reportData.type} onClose={() => setReportData(null)} onSend={(report) => { setParentReports(prev => [...prev, report]); showToast('Report sent!', 'success'); setReportData(null); }} onSaveDraft={(report) => { setParentReports(prev => [...prev, report]); showToast('Draft saved!', 'info'); setReportData(null); }} staffId={user?.id || 'unknown'} />
            )}

            {isGroupMode && !showLeaderDashboard && (
                <GroupCheckInBar
                    selectedCount={selectedEligibleCount}
                    eligibleVisibleCount={eligibleVisible.length}
                    allVisibleSelected={allVisibleSelected}
                    onToggleSelectAll={toggleSelectAllVisible}
                    onCancel={exitGroupMode}
                    onConfirm={() => setGroupConfirmOpen(true)}
                />
            )}

            {undoStudent && (
                <ConfirmDialog
                    title="Undo check-in?"
                    confirmLabel="Undo check-in"
                    confirmColor="var(--color-danger)"
                    onCancel={() => setUndoConfirmId(null)}
                    onConfirm={() => undoCheckIn(undoStudent.id)}
                >
                    <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        Are you sure you want to undo {undoStudent.firstName} {undoStudent.lastName}'s check-in
                        ({program === 'sunrise' ? undoStudent.sunriseTime : undoStudent.sunsetTime} by {(program === 'sunrise' ? undoStudent.sunriseStaff : undoStudent.sunsetStaff) || 'staff'})?
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                        The family's arrival text has already been sent, so they'll get a short correction text. The undo is recorded in the Program Log.
                    </p>
                </ConfirmDialog>
            )}

            {groupConfirmOpen && isGroupMode && selectedEligibleCount > 0 && (
                <ConfirmDialog
                    title={`Check in ${selectedEligibleCount} student${selectedEligibleCount === 1 ? '' : 's'}?`}
                    confirmLabel={`Check in ${selectedEligibleCount}`}
                    confirmColor="var(--color-success)"
                    onCancel={() => setGroupConfirmOpen(false)}
                    onConfirm={() => { setGroupConfirmOpen(false); checkInStudents(selectedEligible.map(s => s.id)); }}
                >
                    <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {program === 'sunrise' ? 'Sunrise' : 'Sunset'} · everyone gets the same check-in time, and each family gets an arrival text.
                    </p>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', textAlign: 'left', padding: '10px 12px', borderRadius: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)' }}>
                        {selectedEligible.map(s => (
                            <div key={s.id}>{s.firstName} {s.lastName} <span style={{ color: 'var(--text-secondary)' }}>· {s.grade}</span></div>
                        ))}
                    </div>
                </ConfirmDialog>
            )}

            {toast && <Toast message={toast.msg} type={toast.type} bottomOffset={isGroupMode ? 120 : 40} />}
        </>
    );
};

export default App;
