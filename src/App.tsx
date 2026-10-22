// src/App.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, mapDbToStudent, isSupabaseConfigured, runDbWrite, resolveStaffProfile } from './supabaseClient';
import type { Student, Staff, ParentReport, BiometricLog, ProgramType, AttendanceStatus } from './types';
import { GRADES, STUDENT_PHOTOS_ENABLED, UNDO_WINDOW_MS } from './constants';
import { INITIAL_STAFF, INITIAL_STUDENTS } from './utils/mockData';
import { sendSmsMock } from './utils/sms';
import { MockDatabase, PasskeyService } from './utils/mock';
import { playAlarm, uuidv4, isUuid, formatClockTime, localDateIso } from './utils/helpers';
import { recordEvents } from './services/auditLog';
import Toast from './components/Toast';
import StaffLogin from './components/StaffLogin';
import StudentDetailModal from './components/StudentDetailModal';
import ConfirmationModal from './components/ConfirmationModal';
import LeaderDashboard from './components/LeaderDashboard';
import ParentReportModal from './components/ParentReportModal';
import GroupCheckInBar from './components/GroupCheckInBar';
import UndoBar from './components/UndoBar';

const statusFor = (s: Student, p: ProgramType): AttendanceStatus => (p === 'sunrise' ? s.sunriseStatus : s.sunsetStatus);
const fullName = (s: Student) => `${s.firstName} ${s.lastName}`;

/**
 * A quick or group check-in that can still be undone. Guardian arrival texts
 * are held until the undo window closes, so an undone mis-tap never tells a
 * family their child arrived.
 */
interface PendingCheckIn {
    ids: string[];
    program: ProgramType;
    time: string;
    staffName: string;
    batchId?: string;
    message: string;
}

/** Sends arrival texts for students from `pending` who are still checked in. */
const sendArrivalTexts = (pending: PendingCheckIn, roster: Student[]) => {
    const ids = new Set(pending.ids);
    const programLabel = pending.program === 'sunrise' ? 'Sunrise' : 'Sunset';
    roster
        .filter(s => ids.has(s.id) && statusFor(s, pending.program) === 'present')
        .forEach(s => {
            const contact1 = s.guardians.find(g => g.type === 'Contact 1');
            if (contact1?.phone) {
                sendSmsMock(contact1.phone, 'checkin_notification', { student_name: s.firstName, time: pending.time, staff_name: pending.staffName, program: programLabel });
            }
        });
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
    const [pendingCheckIn, setPendingCheckIn] = useState<PendingCheckIn | null>(null);

    // Latest values for timers and async callbacks, which would otherwise close
    // over the render they were created in.
    const studentsRef = useRef(students);
    studentsRef.current = students;
    const pendingRef = useRef(pendingCheckIn);
    pendingRef.current = pendingCheckIn;
    const checkInWriteRef = useRef<Promise<boolean> | null>(null);
    // False after an explicit logout: if signOut() could not reach Supabase the
    // saved session survives, and restoring it would sign the person straight back in.
    const restoreSessionRef = useRef(true);

    // Load the roster from Supabase once per signed-in user. This used to depend
    // on staffList too, so toggling a staff permission re-fetched and replaced the
    // whole roster — silently dropping any locally added or imported students.
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        let cancelled = false;
        const fetchInitialData = async () => {
            try {
                const { data, error } = await supabase.from('students').select('*');
                if (error) console.error('Error fetching students:', error.message);
                if (!cancelled && data && data.length > 0) {
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
                if (!cancelled && restoreSessionRef.current) setUser(profile);
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
                    setStudents(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...mapDbToStudent(payload.new) } : s));
                    setLastSyncTime(new Date());
                } else if (payload.eventType === 'DELETE' && payload.old) {
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
                const isInBuilding = (s: Student) => s.sunriseStatus === 'present' || s.sunriseStatus === 'pending_parent';
                const checkOutLabel = `Auto-Check-Out at ${scheduledBatchCheckoutTime}`;
                const affected = studentsRef.current.filter(isInBuilding);
                setStudents(prev => prev.map(s => {
                    if (isInBuilding(s)) {
                        return { ...s, sunriseStatus: 'checked_out' as AttendanceStatus, sunriseCheckOutTime: checkOutLabel };
                    }
                    return s;
                }));
                showToast(`Batch checkout executed at ${scheduledBatchCheckoutTime}`, 'success');
                setScheduledBatchCheckoutTime(null);

                const dbIds = isSupabaseConfigured ? affected.map(s => s.id).filter(isUuid) : [];
                if (dbIds.length > 0) {
                    runDbWrite('Batch checkout', () => supabase.from('students').update({ sunrise_status: 'checked_out', sunrise_checkout_time: checkOutLabel }).in('id', dbIds));
                }
                const batchId = uuidv4();
                recordEvents(affected.map(s => ({
                    studentId: s.id, studentName: fullName(s), type: 'checked_out', program: 'sunrise',
                    staffName: 'Scheduled batch checkout', batchId,
                    detail: `Sunrise batch checkout at ${scheduledBatchCheckoutTime} · ${affected.length} students`,
                })));
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

    /** Sends the held arrival texts and closes the undo window. */
    const settlePendingCheckIn = () => {
        const pending = pendingRef.current;
        if (!pending) return;
        pendingRef.current = null;
        sendArrivalTexts(pending, studentsRef.current);
        setPendingCheckIn(null);
    };

    useEffect(() => {
        if (!pendingCheckIn) return;
        const timer = setTimeout(settlePendingCheckIn, UNDO_WINDOW_MS);
        return () => clearTimeout(timer);
    }, [pendingCheckIn]);

    /**
     * Checks in one student (a quick tap) or a whole group in one action.
     *
     * Every student gets the same timestamp and staff name, the roster updates in
     * a single state change, and the database receives one `update … in (ids)`
     * rather than N requests. Students who were blocked or checked in by someone
     * else since being selected are skipped and reported, never double-recorded.
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

        settlePendingCheckIn(); // a new check-in closes the previous undo window

        const now = new Date();
        const time = formatClockTime(now);
        const staffName = currentStaffName();
        const isGroup = eligible.length > 1;
        const batchId = isGroup ? uuidv4() : undefined;
        const ids = new Set(eligible.map(s => s.id));

        setStudents(prev => prev.map(s => {
            if (!ids.has(s.id) || statusFor(s, p) !== 'absent') return s;
            const update = p === 'sunrise'
                ? { sunriseStatus: 'present' as AttendanceStatus, sunriseTime: time, sunriseStaff: staffName }
                : { sunsetStatus: 'present' as AttendanceStatus, sunsetTime: time, sunsetStaff: staffName };
            return { ...s, ...update, checkInSmsSent: true, checkInSmsTime: time };
        }));
        setPendingCheckIn({
            ids: [...ids], program: p, time, staffName, batchId,
            message: isGroup
                ? `${eligible.length} students checked in · ${time}`
                : `${eligible[0].firstName} ${eligible[0].lastName.charAt(0)}. checked in · ${time}`,
        });
        setSelectedIds(new Set());
        setIsGroupMode(false);
        setSearchQuery('');

        const dbIds = isSupabaseConfigured ? [...ids].filter(isUuid) : [];
        // A fresh day: clear checkout fields left over from a previous day.
        const dbUpdate = p === 'sunrise'
            ? { sunrise_status: 'present', sunrise_checkin_time: time, sunrise_staff: staffName, sunrise_checkout_time: null, sunrise_date: localDateIso(now) }
            : { sunset_status: 'present', sunset_checkin_time: time, sunset_staff: staffName, sunset_checkout_time: null, sunset_date: localDateIso(now) };
        const write = dbIds.length > 0
            ? runDbWrite('Check-in', () => supabase.from('students').update(dbUpdate).in('id', dbIds))
            : Promise.resolve(true);
        checkInWriteRef.current = write; // an Undo must not overtake this write
        const saved = await write;
        const audit = await recordEvents(eligible.map(s => ({
            studentId: s.id, studentName: fullName(s), type: 'check_in', program: p, staffName,
            occurredAt: now.toISOString(), batchId,
            detail: isGroup ? `Group check-in · ${eligible.length} students` : undefined,
        })));

        if (!saved || audit.failed > 0) {
            showToast('Checked in on this device — saving to the database failed', 'warning');
        } else if (skipped > 0) {
            showToast(`${skipped} not checked in (already in or blocked)`, 'warning');
        }
    };

    /**
     * Reverts the most recent quick/group check-in while its undo window is open.
     * The undo is itself recorded — the original check-in event stays on file.
     */
    const undoCheckIn = async () => {
        const pending = pendingRef.current;
        if (!pending) return;
        pendingRef.current = null;
        setPendingCheckIn(null); // held arrival texts are dropped, never sent

        const { program: p, time } = pending;
        const ids = new Set(pending.ids);
        // Only revert check-ins that are still exactly what we recorded — never a
        // student who has since been checked out or re-checked by someone else.
        const stillOurs = (s: Student) => ids.has(s.id) && statusFor(s, p) === 'present' && (p === 'sunrise' ? s.sunriseTime : s.sunsetTime) === time;
        const reverted = studentsRef.current.filter(stillOurs);
        if (reverted.length === 0) return;

        setStudents(prev => prev.map(s => {
            if (!stillOurs(s)) return s;
            const update = p === 'sunrise'
                ? { sunriseStatus: 'absent' as AttendanceStatus, sunriseTime: undefined, sunriseStaff: undefined }
                : { sunsetStatus: 'absent' as AttendanceStatus, sunsetTime: undefined, sunsetStaff: undefined };
            return { ...s, ...update, checkInSmsSent: false, checkInSmsTime: undefined };
        }));
        showToast(reverted.length === 1 ? `Check-in undone for ${reverted[0].firstName}` : `Check-in undone for ${reverted.length} students`, 'info');

        let saved = true;
        const dbIds = isSupabaseConfigured ? reverted.map(s => s.id).filter(isUuid) : [];
        if (dbIds.length > 0) {
            // Two separate requests can arrive out of order; let the check-in land
            // first so the revert is the last write, not the one that gets undone.
            await checkInWriteRef.current;
            const dbUpdate = p === 'sunrise'
                ? { sunrise_status: 'absent', sunrise_checkin_time: null, sunrise_staff: null }
                : { sunset_status: 'absent', sunset_checkin_time: null, sunset_staff: null };
            saved = await runDbWrite('Undo check-in', () => supabase.from('students').update(dbUpdate).in('id', dbIds));
        }
        const audit = await recordEvents(reverted.map(s => ({
            studentId: s.id, studentName: fullName(s), type: 'check_in_undone', program: p,
            staffName: currentStaffName(), batchId: pending.batchId,
            detail: `Reverses the ${time} check-in (undone within ${UNDO_WINDOW_MS / 1000}s)`,
        })));
        if (!saved || audit.failed > 0) {
            showToast('Undone on this device — saving to the database failed', 'warning');
        }
    };

    const exitGroupMode = () => {
        setIsGroupMode(false);
        setSelectedIds(new Set());
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

    // Esc leaves group mode on Chromebooks/desktops.
    useEffect(() => {
        if (!isGroupMode) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitGroupMode(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isGroupMode]);

    const eligibleVisible = useMemo(
        () => filteredStudents.filter(s => statusFor(s, program) === 'absent' && !s.isCheckInBlocked),
        [filteredStudents, program],
    );
    const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every(s => selectedIds.has(s.id));
    // Someone else may check a selected student in meanwhile — count only who is still eligible.
    const selectedEligibleCount = useMemo(
        () => students.filter(s => selectedIds.has(s.id) && statusFor(s, program) === 'absent' && !s.isCheckInBlocked).length,
        [students, selectedIds, program],
    );
    const toggleSelectAllVisible = () => setSelectedIds(prev => {
        const next = new Set(prev);
        if (allVisibleSelected) eligibleVisible.forEach(s => next.delete(s.id));
        else eligibleVisible.forEach(s => next.add(s.id));
        return next;
    });

    /**
     * Tap on a roster card (`intent: 'tap'`) or its ⋮ button (`'details'`).
     * In group mode a tap selects; otherwise a tap checks an absent student in.
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
            checkInStudents([student.id]);
        }
    };

    /** Photo/face-verification check-in — only reachable when STUDENT_PHOTOS_ENABLED. */
    const handleCheckIn = async (studentId: string, photo?: string, biometricData?: any) => {
        const now = new Date();
        const timeString = formatClockTime(now);
        const staffName = currentStaffName();

        settlePendingCheckIn();
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

        if (isSupabaseConfigured && isUuid(studentId)) {
            // The photo stays on this device. The schema stores image URLs only,
            // never raw image data, so checkin_photo is not written here.
            const updateData = program === 'sunrise'
                ? { sunrise_status: 'present', sunrise_checkin_time: timeString, sunrise_staff: staffName, sunrise_checkout_time: null, sunrise_date: localDateIso(now) }
                : { sunset_status: 'present', sunset_checkin_time: timeString, sunset_staff: staffName, sunset_checkout_time: null, sunset_date: localDateIso(now) };
            const saved = await runDbWrite('Check-in', () => supabase.from('students').update(updateData).eq('id', studentId));
            if (!saved) showToast('Checked in on this device — saving to the database failed', 'warning');
        }
        if (student) {
            recordEvents([{ studentId, studentName: fullName(student), type: 'check_in', program, staffName, occurredAt: now.toISOString(), detail: photo ? 'Photo captured at check-in' : undefined }]);
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

    const handleCheckOut = async (studentId: string, smsTime: string, checkOutBy?: string) => {
        const p = program;
        const student = studentsRef.current.find(s => s.id === studentId);
        const persist = isSupabaseConfigured && isUuid(studentId);

        setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
                const update = p === 'sunrise'
                    ? { sunriseStatus: 'pending_parent' as AttendanceStatus }
                    : { sunsetStatus: 'pending_parent' as AttendanceStatus };
                return { ...s, ...update, smsSentTime: smsTime, lastCheckOutBy: checkOutBy };
            }
            return s;
        }));

        if (persist) {
            const updateData = p === 'sunrise'
                ? { sunrise_status: 'pending_parent', sms_sent_time: smsTime, last_checkout_by: checkOutBy }
                : { sunset_status: 'pending_parent', sms_sent_time: smsTime, last_checkout_by: checkOutBy };
            await runDbWrite('Check-out', () => supabase.from('students').update(updateData).eq('id', studentId));
        }
        if (student) {
            recordEvents([{ studentId, studentName: fullName(student), type: 'checkout_requested', program: p, staffName: checkOutBy || 'Staff', detail: 'Guardian pickup text simulated — SMS provider not connected' }]);
        }

        // Stand-in for the guardian's text reply until an SMS provider is wired up.
        setTimeout(async () => {
            const timeString = formatClockTime();
            setStudents(prev => prev.map(s => {
                if (s.id === studentId) {
                    const update = p === 'sunrise'
                        ? { sunriseStatus: 'checked_out' as AttendanceStatus, sunriseCheckOutTime: timeString }
                        : { sunsetStatus: 'checked_out' as AttendanceStatus, sunsetCheckOutTime: timeString };
                    return { ...s, ...update };
                }
                return s;
            }));
            if (persist) {
                const dbUpdate = p === 'sunrise'
                    ? { sunrise_status: 'checked_out', sunrise_checkout_time: timeString }
                    : { sunset_status: 'checked_out', sunset_checkout_time: timeString };
                await runDbWrite('Check-out', () => supabase.from('students').update(dbUpdate).eq('id', studentId));
            }
            if (student) {
                recordEvents([{ studentId, studentName: fullName(student), type: 'checked_out', program: p, staffName: checkOutBy || 'Staff', detail: 'Guardian confirmation simulated — SMS provider not connected' }]);
            }
        }, 5000);
    };

    const handleSaveStudent = async (updatedStudent: Student) => {
        const oldStudent = students.find(s => s.id === updatedStudent.id);
        setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));

        if (isSupabaseConfigured && isUuid(updatedStudent.id)) {
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
            recordEvents([{ studentId: updatedStudent.id, studentName: fullName(updatedStudent), type: 'head_injury_started', program, staffName: currentStaffName() }]);
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
        settlePendingCheckIn();
        exitGroupMode();
        // Without signOut() the Supabase session survived "Logout": the auth effect
        // above re-read it and signed a listed staff member straight back in, and a
        // reload did the same — on a shared site Chromebook the next person
        // inherited the previous person's identity.
        restoreSessionRef.current = false;
        if (isSupabaseConfigured) void supabase.auth.signOut();
        setUser(null);
    };

    const handleLogin = (staff: Staff) => {
        restoreSessionRef.current = true;
        setUser(staff);
    };

    if (!user) return <StaffLogin onLogin={handleLogin} onToggleDemo={() => setIsDemoMode(!isDemoMode)} isDemoMode={isDemoMode} staffList={staffList} />;

    const activeStudent = students.find(s => s.id === activeStudentId);
    const confirmStudent = students.find(s => s.id === showConfirmId);

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
                                            ) : (
                                                <span style={{ padding: '6px 12px', borderRadius: '999px', border: '1px dashed var(--text-muted)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                                    Tap to check in
                                                </span>
                                            )
                                        ) : (
                                            <div style={{ textAlign: 'right' }}>
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
                    onConfirm={() => checkInStudents([...selectedIds])}
                />
            )}

            {pendingCheckIn && !isGroupMode && !showLeaderDashboard && (
                <UndoBar message={pendingCheckIn.message} onUndo={undoCheckIn} />
            )}

            {toast && <Toast message={toast.msg} type={toast.type} bottomOffset={isGroupMode || pendingCheckIn ? 120 : 40} />}
        </>
    );
};

export default App;
