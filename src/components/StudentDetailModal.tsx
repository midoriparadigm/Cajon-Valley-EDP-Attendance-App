// src/components/StudentDetailModal.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Student, Staff, GuardianContact, HeadInjuryLog, ParentReport, ProgramType, BiometricLog, BehaviorStatus, AttendanceStatus } from '../types';
import { BEHAVIOR_CHECKLISTS, BEHAVIOR_ROLE_DESCRIPTIONS, STUDENT_PHOTOS_ENABLED } from '../constants';
import { sendSmsMock } from '../utils/sms';
import { MockDatabase } from '../utils/mock';
import { playAlarm } from '../utils/helpers';
import HeadInjuryChecklist from './HeadInjuryChecklist';
import CollapsedBehaviorView from './CollapsedBehaviorView';
import CollapsedWeCareView from './CollapsedWeCareView';
import CollapsedHeadInjuryView from './CollapsedHeadInjuryView';
import GuardianAddForm from './GuardianAddForm';
import StudentSummary, { KindIcon, StatusChip, type SummarySection } from './StudentSummary';
import { buildTodayEntries, tileBadge, isReportRestricted, nextHeadInjuryCheck, type SummaryKind, type SummaryViewer } from '../utils/recordSummary';

/** A contact may be chosen at check-out unless their pickup approval is still pending. */
const isPickupApproved = (g: GuardianContact) => g.type === 'Contact 1' || g.authStatus !== 'pending';
import WeCareReportForm from './WeCareReportForm';

interface StudentDetailModalProps {
    student: Student;
    onClose: () => void;
    onSave: (s: Student) => void;
    /** Resolves true if the check-out went ahead; the database may refuse it. */
    onCheckOut: (id: string, smsTime: string, checkOutBy?: string, releasedTo?: string) => Promise<boolean>;
    currentStaff: Staff;
    program: ProgramType;
    isLeadMode: boolean;
    darkMode: boolean;
    onUpdateReport?: (r: ParentReport) => void;
    showToast?: (m: string, t: any) => void;
    staffList: Staff[];
    parentReports: ParentReport[];
}

const StudentDetailModal = (props: StudentDetailModalProps) => {
    const { student, onClose, onSave, onCheckOut, currentStaff, program, isLeadMode, darkMode, onUpdateReport, showToast, staffList, parentReports } = props;

    const [editedStudent, setEditedStudent] = useState({ ...student });
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [behaviorCollapsed, setBehaviorCollapsed] = useState(student.behavior !== 'none');
    const [showTicketOptions, setShowTicketOptions] = useState(false);
    const [showWeCareOptions, setShowWeCareOptions] = useState(false);
    const [weCareCollapsed, setWeCareCollapsed] = useState(!!student.weCareTimestamp);
    const [checkoutBy, setCheckoutBy] = useState<'Contact 1' | 'Contact 2' | 'Contact 3' | 'Contact 4' | 'Contact 5'>('Contact 1');
    const [filedReportType, setFiledReportType] = useState<'behavior' | 'wecare' | null>(null);
    const [isEditingWeCare, setIsEditingWeCare] = useState(false);
    const [isEditingBehavior, setIsEditingBehavior] = useState(false);
    const [activeSection, setActiveSection] = useState<'attendance' | 'behavior' | 'wecare' | 'injury' | 'guardians' | null>(null);

    // Guardian Management V2 State
    const [editingGuardianIndex, setEditingGuardianIndex] = useState<number | null>(null);
    const [isAddingGuardian, setIsAddingGuardian] = useState(false);
    const [confirmApprovalIndex, setConfirmApprovalIndex] = useState<number | null>(null);

    const primaryGuardian = (editedStudent.guardians || []).find(g => g.type === 'Contact 1');

    const commitGuardians = (updatedGuardians: GuardianContact[]) => {
        const updatedStudent = {
            ...editedStudent,
            guardians: updatedGuardians,
            contactLastUpdated: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setEditedStudent(updatedStudent);
        onSave(updatedStudent);
    };

    /**
     * Asks the primary guardian to approve a pickup contact. Sending the request
     * is not an approval: the contact stays 'pending' — and cannot be chosen at
     * check-out — until a Lead records the primary guardian's answer.
     * (Previously the contact was stamped "Authorized by <primary>" the moment
     * the request went out, before anyone had replied.)
     */
    const requestPickupApproval = (contact: GuardianContact): GuardianContact => {
        if (primaryGuardian?.phone) {
            sendSmsMock(primaryGuardian.phone, 'auth_request', {
                guardian_name: `${contact.firstName} ${contact.lastName}`,
                role_type: contact.type,
                student_names: `${editedStudent.firstName}`
            });
        }
        return {
            ...contact,
            authStatus: 'pending',
            authRequestedAt: new Date().toLocaleString([], { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' }),
            authorizedBy: undefined,
            authDate: undefined,
            authRecordedBy: undefined,
        };
    };

    const handleSaveGuardian = (contact: GuardianContact) => {
        const updatedGuardians = [...(editedStudent.guardians || [])];

        if (editingGuardianIndex !== null) {
            const previous = updatedGuardians[editingGuardianIndex];
            const merged = { ...previous, ...contact };
            // A new name is a different person, so an earlier approval must not carry over.
            const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
            const personChanged = !sameName(previous.firstName, contact.firstName) || !sameName(previous.lastName, contact.lastName);
            updatedGuardians[editingGuardianIndex] = merged.type !== 'Contact 1' && personChanged
                ? requestPickupApproval(merged)
                : merged;
            setEditingGuardianIndex(null);
        } else {
            updatedGuardians.push(contact.type === 'Contact 1' ? contact : requestPickupApproval(contact));
            setIsAddingGuardian(false);
        }
        commitGuardians(updatedGuardians);
    };

    /** Lead records that the primary guardian has approved a pending pickup contact. */
    const handleRecordApproval = (index: number) => {
        const updatedGuardians = [...(editedStudent.guardians || [])];
        updatedGuardians[index] = {
            ...updatedGuardians[index],
            authStatus: 'approved',
            authorizedBy: primaryGuardian ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}` : 'EDP Lead (no primary contact on file)',
            authDate: new Date().toLocaleDateString(),
            authRecordedBy: currentStaff.name,
        };
        setConfirmApprovalIndex(null);
        commitGuardians(updatedGuardians);
        showToast(`Pickup approval recorded for ${updatedGuardians[index].firstName}`, 'success');
    };

    const handleDeleteGuardian = () => {
        if (editingGuardianIndex === null) return;
        const updatedGuardians = [...(editedStudent.guardians || [])];
        updatedGuardians.splice(editingGuardianIndex, 1);
        setEditingGuardianIndex(null);
        commitGuardians(updatedGuardians);
    };
    const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
    const alarmPlayedRef = useRef(false);
    const isLead = (currentStaff.role === 'Lead' || currentStaff.canAdminTasks) && isLeadMode;

    useEffect(() => {
        setEditedStudent({ ...student });
        setEditingGuardianIndex(null);
        setIsAddingGuardian(false);
    }, [student]);

    useEffect(() => {
        if (!editedStudent.headInjuryStartTime || !editedStudent.headInjury) return;

        const interval = setInterval(() => {
            const elapsed = Number(Date.now()) - editedStudent.headInjuryStartTime!;
            const nextCheck = editedStudent.headInjuryLogs.some(l => l.stage === '15min') ? 30 * 60 * 1000 : 15 * 60 * 1000;
            const remaining = nextCheck - elapsed;

            if (remaining <= 0) {
                setTimeLeft(0);
                if (!alarmPlayedRef.current && isHeadInjuryMonitoring(0)) {
                    playAlarm();
                    alarmPlayedRef.current = true;
                }
            } else {
                setTimeLeft(remaining);
                alarmPlayedRef.current = false;
            }
        }, 33);
        return () => clearInterval(interval);
    }, [editedStudent.headInjuryStartTime, editedStudent.headInjury, editedStudent.headInjuryLogs]);

    const isHeadInjuryMonitoring = (currentTimeLeft = timeLeft) => {
        if (!editedStudent.headInjury) return false;
        const logs = editedStudent.headInjuryLogs;
        const has30 = logs.some(l => l.stage === '30min');
        if (has30) return false;
        return true;
    };

    const handleSectionSave = (updatedStudent: Student) => {
        setEditedStudent(updatedStudent);
        onSave(updatedStudent);
    };

    const saveBehavior = () => {
        const now = Date.now();
        const isFirstSubmission = !editedStudent.behaviorSubmittedAt;

        const updatedStudent = {
            ...editedStudent,
            // Who submitted it: staff always see their own reports, and the
            // Handling Staff chosen below can be someone else.
            behaviorFiledBy: isFirstSubmission ? currentStaff.name : editedStudent.behaviorFiledBy,
            behaviorSubmittedAt: isFirstSubmission ? now : editedStudent.behaviorSubmittedAt,
            behaviorEditCount: isFirstSubmission ? 0 : (editedStudent.behaviorEditCount || 0) + 1,
            behaviorLastEditedAt: now
        };

        setBehaviorCollapsed(true);
        setShowTicketOptions(false);
        setIsEditingBehavior(false);
        setEditedStudent(updatedStudent);
        handleSectionSave(updatedStudent);
    };

    /**
     * A submitted ticket. One read back from the database has no submission
     * time on this device (only the saved record has a ticket); it used to open
     * to a blank screen.
     */
    const isSavedTicket = (s: Student) => s.behavior !== 'none' && (!!s.behaviorSubmittedAt || student.behavior !== 'none');

    const canEditBehaviorTicket = (student: Student): boolean => {
        // Not submitted yet — or saved before this page loaded, when the 10-minute
        // edit window can't be checked (and an edit would count as a new submission): view only.
        if (!student.behaviorSubmittedAt) return !isSavedTicket(student);

        const now = Date.now();
        const tenMinutesInMs = 10 * 60 * 1000;
        const timeElapsed = now - student.behaviorSubmittedAt;
        const withinTimeWindow = timeElapsed < tenMinutesInMs;
        const withinRevisionLimit = (student.behaviorEditCount || 0) < 1;

        return withinTimeWindow && withinRevisionLimit;
    };

    const getBehaviorEditTimeRemaining = (student: Student): string | undefined => {
        if (!student.behaviorSubmittedAt || !canEditBehaviorTicket(student)) return undefined;

        const now = Date.now();
        const tenMinutesInMs = 10 * 60 * 1000;
        const timeElapsed = now - student.behaviorSubmittedAt;
        const timeRemaining = tenMinutesInMs - timeElapsed;

        const minutesLeft = Math.ceil(timeRemaining / (60 * 1000));
        return `Can edit: ${minutesLeft} min remaining`;
    };

    const handleEditBehavior = () => {
        if (!canEditBehaviorTicket(editedStudent)) {
            const now = Date.now();
            const tenMinutesInMs = 10 * 60 * 1000;
            const timeElapsed = now - (editedStudent.behaviorSubmittedAt || 0);

            if (timeElapsed >= tenMinutesInMs) {
                showToast?.('Edit window expired (10 minutes elapsed)', 'error');
            } else if ((editedStudent.behaviorEditCount || 0) >= 1) {
                showToast?.('Maximum revisions reached (1 allowed)', 'error');
            }
            return;
        }

        setIsEditingBehavior(true);
        setShowTicketOptions(true);
    };


    const cancelTicket = () => {
        setEditedStudent(prev => ({ ...prev, behavior: 'none', behaviorIssues: [], behaviorDescription: undefined }));
        setShowTicketOptions(false);
        setIsEditingBehavior(false);
        setActiveSection(null);
    };

    const setBehavior = (status: BehaviorStatus) => {
        if (status === editedStudent.behavior) {
            setEditedStudent({ ...editedStudent, behavior: 'none' as BehaviorStatus, behaviorIssues: [], behaviorDescription: undefined });
        } else {
            const now = new Date();
            const stamp = now.toLocaleString([], { month: 'numeric', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
            setEditedStudent({
                ...editedStudent,
                behavior: status,
                behaviorIssues: editedStudent.behaviorIssues || [],
                behaviorTimestamp: stamp,
                behaviorStaff: currentStaff.name,
                behaviorStaffSupport: currentStaff.name
            });
            setBehaviorCollapsed(false);
            setShowTicketOptions(true);
            setIsEditingBehavior(true);
        }
    };

    const startNewTicket = () => {
        const now = new Date();
        const stamp = now.toLocaleString([], { month: 'numeric', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        setEditedStudent({
            ...editedStudent,
            behavior: 'green',
            behaviorIssues: editedStudent.behaviorIssues || [],
            behaviorTimestamp: stamp,
            behaviorStaff: currentStaff.name,
            behaviorStaffSupport: currentStaff.name
        });
        setBehaviorCollapsed(false);
        setShowTicketOptions(true);
        setIsEditingBehavior(true);
    };

    const handleLocalCheckOut = async () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        const activeGuardian = student.guardians?.find(g => g.type === checkoutBy) || student.guardians?.[0];
        if (activeGuardian && !isPickupApproved(activeGuardian)) {
            showToast(`${activeGuardian.firstName} is not approved for pickup yet`, 'error');
            return;
        }
        setShowCheckOutConfirm(false);
        const staffName = currentStaff ? `${currentStaff.name} (${currentStaff.organization})` : 'Staff';
        const releasedTo = activeGuardian ? `${activeGuardian.type}: ${activeGuardian.firstName} ${activeGuardian.lastName}` : undefined;

        // The app writes the check-out (the database can refuse it, e.g. if the
        // child was already checked out elsewhere); the roster shown here follows
        // the app's student record. Pickup texts go out only once it went ahead.
        const done = await onCheckOut(student.id, timeStr, staffName, releasedTo);
        if (!done) return;

        const activePhone = activeGuardian?.phone || '619-549-0572';
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

        sendSmsMock(activePhone, 'pickup_notification', {
            guardian_name: activeGuardian ? `${activeGuardian.firstName} ${activeGuardian.lastName}` : 'Guardian',
            school_name: 'Cajon Valley EDP',
            time: timeStr,
            date: dateStr,
            student_names: `${student.firstName} ${student.lastName}`
        });

        if (checkoutBy !== 'Contact 1') {
            const primary = student.guardians?.find(g => g.type === 'Contact 1');
            if (primary && primary.phone && primary.phone !== activePhone) {
                console.log(`[Cascade Alert] Sending SMS to Primary ${primary.firstName} because checkout was by ${checkoutBy}`);
                sendSmsMock(primary.phone, 'pickup_notification', {
                    guardian_name: activeGuardian ? `${activeGuardian.firstName} ${activeGuardian.lastName}` : 'Secondary Guardian',
                    school_name: 'Cajon Valley EDP',
                    time: timeStr,
                    date: dateStr,
                    student_names: `${student.firstName} ${student.lastName}`
                });
            }
        }
    };

    const currentStatus = program === 'sunrise' ? editedStudent.sunriseStatus : editedStudent.sunsetStatus;
    const isPresent = currentStatus === 'present';

    const studentMenuOptions: { id: SummarySection & SummaryKind; label: string }[] = [
        { id: 'attendance', label: 'Attendance Record' },
        { id: 'behavior', label: 'Green Card Behavior Ticket' },
        { id: 'wecare', label: 'We Care Report' },
        { id: 'injury', label: 'Head Injury Report' },
        ...(isLead ? [{ id: 'guardians' as const, label: 'Guardian Contacts' }] : []),
    ];

    // Who sees which reports: see src/utils/recordSummary.ts. Permission
    // changes made in Staff Permissions live in staffList.
    const viewer = useMemo<SummaryViewer>(() => ({
        name: currentStaff.name,
        isLead,
        canViewAllReports: !!(staffList.find(s => s.id === currentStaff.id) ?? currentStaff).canViewAllReports,
    }), [currentStaff, isLead, staffList]);

    /** A report on the saved record that this staff member didn't file and may not open. */
    const isRestricted = (id: SummarySection | null) =>
        (id === 'behavior' || id === 'wecare' || id === 'injury') && isReportRestricted(student, viewer, id);

    const isDisabledByCheckout = (id: SummarySection) =>
        (currentStatus === 'checked_out' || currentStatus === 'pending_parent') && ['behavior', 'wecare', 'injury'].includes(id);

    const openSection = (id: SummarySection) => {
        if (isDisabledByCheckout(id)) return;
        setActiveSection(id);
        if (isRestricted(id)) return; // shows the locked notice, never the report or a new form
        // Auto-trigger ticket/report creation flow for behavior and wecare sections
        if (id === 'behavior' && editedStudent.behavior === 'none') {
            startNewTicket();
        }
        if (id === 'wecare' && !editedStudent.weCareTimestamp) {
            setShowWeCareOptions(true);
            setIsEditingWeCare(true);
        }
    };

    // Tile badges follow the saved record (the student prop), not unsaved edits in progress.
    const todayEntries = useMemo(
        () => buildTodayEntries(student, { program, viewer, parentReports, dayEvents: [] }),
        [student, program, viewer, parentReports],
    );
    const activeOption = studentMenuOptions.find(o => o.id === activeSection);
    const lockedSection = isRestricted(activeSection);
    const nextCheck = lockedSection && activeSection === 'injury' ? nextHeadInjuryCheck(student) : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-app)' }}>
            {/* Title Bar - Dashboard Style */}
            <div style={{
                padding: '16px 20px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)' }}>
                        {STUDENT_PHOTOS_ENABLED && student.yearbookPhotoUrl ? (
                            <img src={student.yearbookPhotoUrl} alt={student.firstName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '800' }}>
                                {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>{student.firstName} {student.lastName}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>Grade {student.grade}</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {student.programs.includes('ELOP') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: '700' }}>ELOP</span>}
                                {student.programs.includes('ASES') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#6b21a8', fontWeight: '700' }}>ASES</span>}
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)' }}
                    title="Close"
                >
                    <span className="material-icons-round">close</span>
                </button>
            </div>

            {/* Menu View - Card Grid */}
            {!activeSection && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: '100px' }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <StudentSummary
                            student={student}
                            program={program}
                            viewer={viewer}
                            parentReports={parentReports}
                            canOpen={id => !isDisabledByCheckout(id)}
                            onOpen={openSection}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {studentMenuOptions.map(option => {
                                const disabled = isDisabledByCheckout(option.id);
                                const badge = tileBadge(todayEntries, option.id);
                                return (
                                    <button key={option.id} onClick={() => openSection(option.id)} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.1s, box-shadow 0.1s', opacity: disabled ? 0.4 : 1, filter: disabled ? 'grayscale(1)' : 'none' }} onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                        <KindIcon kind={option.id} size={28} box={56} />
                                        <div>
                                            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>{option.label}</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                {disabled ? 'Student checked out' : isRestricted(option.id) ? (
                                                    <StatusChip tone="neutral">
                                                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '12px', verticalAlign: '-2px', marginRight: '3px' }}>lock</span>
                                                        Filed by another staff member
                                                    </StatusChip>
                                                ) : badge ? <StatusChip tone={badge.tone}>{badge.badge}</StatusChip> : 'Tap to open'}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Active Section View */}
            {activeSection && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {activeOption && <KindIcon kind={activeOption.id} size={24} box={40} />}
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>{activeOption?.label}</h3>
                        </div>
                        <button onClick={() => setActiveSection(null)} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '16px' }}>
                        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {lockedSection && (
                                <section style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', padding: '32px 24px', textAlign: 'center', maxWidth: '560px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                                    <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '40px', color: 'var(--text-muted)' }}>lock</span>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', marginTop: '8px' }}>
                                        {activeSection === 'behavior' ? 'Green Card' : activeSection === 'wecare' ? 'We Care report' : 'Head injury report'} filed by another staff member
                                    </div>
                                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                                        Only the EDP Lead, the staff member who filed it, and staff the Lead has given "See All Reports" can open it.
                                    </div>
                                    {nextCheck && (
                                        // Safety: say that checks are due, without showing the report itself.
                                        <div role="status" style={{ marginTop: '16px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--color-danger-bg)', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
                                            Head-injury checks are still in progress{nextCheck.due ? ` — next check due ${nextCheck.due}` : ''}. Let the Lead know if you are with {student.firstName}.
                                        </div>
                                    )}
                                </section>
                            )}

                            {activeSection === 'attendance' && (
                                <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {isPresent && !showCheckOutConfirm && isLead && (
                                            <button onClick={() => setShowCheckOutConfirm(true)} style={{ width: '100%', backgroundColor: 'var(--color-sunset)', color: 'white', border: 'none', padding: '16px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px' }}>
                                                <span className="material-icons-round">logout</span> CHECK-OUT
                                            </button>
                                        )}

                                        {showCheckOutConfirm && (
                                            <div style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-subtle)', animation: 'slideUp 0.2s' }}>
                                                <div style={{ marginBottom: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Confirm Check-Out?</div>
                                                <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Checkout By:</label>
                                                    <select title="Select Guardian" value={checkoutBy} onChange={(e) => setCheckoutBy(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}>
                                                        {student.guardians?.map(g => (
                                                            <option key={g.type} value={g.type} disabled={!isPickupApproved(g)}>
                                                                {g.type}: {g.firstName} {g.lastName}{isPickupApproved(g) ? '' : ' — awaiting approval'}
                                                            </option>
                                                        ))}
                                                        {(!student.guardians || student.guardians.length === 0) && <option value="Primary">Primary (Unknown)</option>}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    <button onClick={() => setShowCheckOutConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                                    <button onClick={handleLocalCheckOut} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: darkMode ? '#3b82f6' : 'var(--color-success)', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Yes</button>
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: 'var(--bg-app)', borderRadius: '10px' }}>
                                                {/* Check-In row - green only if it's the latest event */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>Check-In:</span>
                                                    <span style={{ fontSize: '13px', fontWeight: currentStatus === 'present' && !editedStudent.checkInSmsSent ? '700' : '500', color: currentStatus === 'present' && !editedStudent.checkInSmsSent ? 'var(--color-success)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {program === 'sunrise' ? editedStudent.sunriseTime : editedStudent.sunsetTime || '--:--'}
                                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500', marginLeft: '4px' }}>
                                                            by {program === 'sunrise' ? editedStudent.sunriseStaff : editedStudent.sunsetStaff}
                                                        </span>
                                                    </span>
                                                </div>
                                                {/* Check-In SMS Sent row */}
                                                {editedStudent.checkInSmsSent && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>Check-In SMS Sent:</span>
                                                        <span style={{ fontSize: '13px', fontWeight: currentStatus === 'present' ? '700' : '500', color: currentStatus === 'present' ? 'var(--color-success)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>{currentStatus === 'present' ? 'check_circle' : 'done'}</span> {editedStudent.checkInSmsTime}
                                                        </span>
                                                    </div>
                                                )}
                                                {(currentStatus === 'pending_parent' || currentStatus === 'checked_out') && (
                                                    <>
                                                        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>Check-Out SMS Sent:</span>
                                                            <span style={{ fontSize: '13px', fontWeight: currentStatus === 'pending_parent' ? '700' : '500', color: currentStatus === 'pending_parent' ? 'var(--color-success)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>{currentStatus === 'pending_parent' ? 'check_circle' : 'done'}</span> {editedStudent.smsSentTime || '--:--'}
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                                {currentStatus === 'checked_out' && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>Checked-Out:</span>
                                                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                                                            {program === 'sunrise' ? editedStudent.sunriseCheckOutTime : editedStudent.sunsetCheckOutTime || '--:--'}
                                                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500', marginLeft: '4px' }}>
                                                                by {editedStudent.lastCheckOutBy || (program === 'sunrise' ? editedStudent.sunriseCheckoutBy : editedStudent.sunsetCheckoutBy) || 'Staff'}
                                                            </span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {activeSection === 'behavior' && !lockedSection && (
                                <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-app)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                        {editedStudent.behavior !== 'none' && !isEditingBehavior && isSavedTicket(editedStudent) && (
                                            <div style={{ marginBottom: '16px' }}>
                                                <CollapsedBehaviorView
                                                    student={editedStudent}
                                                    onClick={handleEditBehavior}
                                                    canEdit={canEditBehaviorTicket(editedStudent)}
                                                    editTimeRemaining={getBehaviorEditTimeRemaining(editedStudent)}
                                                />
                                            </div>
                                        )}

                                        {(editedStudent.behavior === 'none' || isEditingBehavior) && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {editedStudent.behavior !== 'none' && (
                                                    <div style={{ animation: 'slideUp 0.2s', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {!isEditingBehavior && student.behaviorTimestamp ? (
                                                            <div style={{ padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                                                                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>Behavior Ticket Filed</div>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{student.behaviorTimestamp} by {student.behaviorStaff}</div>
                                                                <button onClick={() => setIsEditingBehavior(true)} style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)', fontSize: '12px', fontWeight: '700', cursor: 'pointer', color: 'var(--text-main)' }}>EDIT TICKET</button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {/* Two-column layout for desktop - eliminates scrolling */}
                                                                <div className="responsive-modal-grid">
                                                                    {/* LEFT COLUMN: Staff, Details, Actions, Buttons */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', overflow: 'hidden' }}>
                                                                        {/* Staff Selection - stacked vertically */}
                                                                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                                                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Handling Staff</label>
                                                                            <select
                                                                                value={editedStudent.behaviorStaff || currentStaff.name}
                                                                                onChange={(e) => setEditedStudent({ ...editedStudent, behaviorStaff: e.target.value })}
                                                                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', outline: 'none' }}
                                                                            >
                                                                                {staffList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                                            </select>
                                                                        </div>

                                                                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                                                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Staff Closest to Situation</label>
                                                                            <select
                                                                                value={editedStudent.behaviorStaffSupport || ''}
                                                                                onChange={(e) => setEditedStudent({ ...editedStudent, behaviorStaffSupport: e.target.value })}
                                                                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', outline: 'none' }}
                                                                            >
                                                                                <option value="">Choose Staff...</option>
                                                                                {staffList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                                            </select>
                                                                        </div>

                                                                        {/* Details textarea - optimized height */}
                                                                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details of the Incident</label>
                                                                            <textarea
                                                                                value={editedStudent.behaviorDescription || ''}
                                                                                onChange={e => setEditedStudent({ ...editedStudent, behaviorDescription: e.target.value })}
                                                                                placeholder="Describe the details of the incident..."
                                                                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'inherit', outline: 'none', lineHeight: '1.4', fontSize: '13px', resize: 'none' }}
                                                                            />

                                                                        </div>

                                                                        {/* Actions textarea - optimized height */}
                                                                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions Taken by Staff</label>
                                                                            <textarea
                                                                                value={editedStudent.behaviorActions || ''}
                                                                                onChange={e => setEditedStudent({ ...editedStudent, behaviorActions: e.target.value })}
                                                                                placeholder="Describe actions taken..."
                                                                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '13px', flex: 1, outline: 'none', fontFamily: 'inherit', resize: 'none' }}
                                                                            />
                                                                        </div>

                                                                    </div>

                                                                    {/* RIGHT COLUMN: Guidelines and Behavior Checklist */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden', minHeight: 0 }}>
                                                                        {/* Guidelines box */}
                                                                        <div style={{ padding: '8px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '12px', lineHeight: '1.4', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                                                            <strong>BEHAVIOR GUIDELINES:</strong><br />
                                                                            Please fill out the following behavior ticket per student/behavior as detailed as possible.
                                                                        </div>

                                                                        {/* Behavior checklist - styled like Head Injury questionnaire */}
                                            <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border-subtle)', flex: '1', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                                                            <div style={{ backgroundColor: 'var(--bg-card)', padding: '6px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                                                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check Behaviors</label>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                                                                                    {BEHAVIOR_CHECKLISTS[editedStudent.behavior as 'green']?.map((item) => {
                                                                                        const issuesList = editedStudent.behaviorIssues || [];
                                                                                        const isChecked = issuesList.includes(item);
                                                                                        const isDisabled = !isEditingBehavior;
                                                                                        return (
                                                                                            <div
                                                                                                key={item}
                                                                                                onClick={() => {
                                                                                                    if (isDisabled) return;
                                                                                                    const currentIssues = editedStudent.behaviorIssues || [];
                                                                                                    const issues = currentIssues.includes(item) ? currentIssues.filter(i => i !== item) : [...currentIssues, item];
                                                                                                    setEditedStudent({ ...editedStudent, behaviorIssues: issues });
                                                                                                }}
                                                                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px 2px 4px', borderBottom: '1px solid var(--bg-app)', cursor: isDisabled ? 'not-allowed' : 'pointer', borderRadius: '4px', transition: 'background 0.15s' }}
                                                                                                onMouseEnter={e => { if (!isDisabled) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)'; }}
                                                                                                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                                                                                            >
                                                                                                <span style={{ fontSize: '13px', color: 'var(--text-main)', flex: 1, paddingRight: '4px', fontWeight: '500' }}>{item}</span>
                                                                                                <div
                                                                                                    style={{
                                                                                                        width: '36px', height: '26px', borderRadius: '6px', flexShrink: 0,
                                                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                                        border: isChecked ? '2px solid var(--color-success)' : '1px solid var(--border-subtle)',
                                                                                                        backgroundColor: isChecked ? 'var(--color-success-bg)' : 'var(--bg-card)',
                                                                                                        color: isChecked ? 'var(--color-success)' : 'var(--text-secondary)',
                                                                                                        fontWeight: '800', fontSize: '14px',
                                                                                                        opacity: isDisabled ? 0.5 : 1,
                                                                                                        pointerEvents: 'none',
                                                                                                        transition: 'all 0.2s ease'
                                                                                                    }}
                                                                                                >{isChecked ? '✓' : '—'}</div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                        {/* Action Buttons — shown when actively editing a behavior ticket */}
                                                                        {editedStudent.behavior !== 'none' && (!editedStudent.behaviorSubmittedAt || isEditingBehavior) && (
                                                                            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        if (isEditingBehavior) {
                                                                                            setEditedStudent({
                                                                                                ...editedStudent,
                                                                                                behavior: student.behavior,
                                                                                                behaviorIssues: student.behaviorIssues || [],
                                                                                                behaviorDescription: student.behaviorDescription || '',
                                                                                                behaviorActions: student.behaviorActions || '',
                                                                                                behaviorStaff: student.behaviorStaff,
                                                                                                behaviorStaffSupport: student.behaviorStaffSupport,
                                                                                            });
                                                                                            setIsEditingBehavior(false);
                                                                                        } else {
                                                                                            setEditedStudent({ ...editedStudent, behavior: 'none', behaviorIssues: [], behaviorDescription: '', behaviorActions: '' });
                                                                                            setShowTicketOptions(false);
                                                                                        }
                                                                                    }}
                                                                                    style={{ flex: 1, padding: '14px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                                                                                >Cancel</button>
                                                                                <button
                                                                                    onClick={saveBehavior}
                                                                                    style={{ flex: 1, padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
                                                                                >{isEditingBehavior ? 'Save Changes' : 'Submit'}</button>
                                                                            </div>
                                                                        )}

                                                                        {editedStudent.behavior === 'none' && showTicketOptions && (
                                                                            <button onClick={() => setShowTicketOptions(false)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {activeSection === 'wecare' && !lockedSection && (
                                <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)', marginBottom: '16px' }}>
                                    <div style={{ padding: '16px' }}>
                                        {(filedReportType === 'wecare' || (!isEditingWeCare && editedStudent.weCareTimestamp)) ? (
                                            <CollapsedWeCareView
                                                student={editedStudent}
                                                onClick={() => {
                                                    const canEdit = (() => {
                                                        if (!editedStudent.weCareSubmittedAt) return true;
                                                        const now = Date.now();
                                                        const tenMin = 10 * 60 * 1000;
                                                        const elapsed = now - editedStudent.weCareSubmittedAt;
                                                        return elapsed < tenMin && (editedStudent.weCareEditCount || 0) < 1;
                                                    })();
                                                    if (canEdit) {
                                                        setIsEditingWeCare(true);
                                                        setShowWeCareOptions(true);
                                                        setFiledReportType(null);
                                                    } else {
                                                        const now = Date.now();
                                                        const tenMin = 10 * 60 * 1000;
                                                        const elapsed = now - (editedStudent.weCareSubmittedAt || 0);
                                                        if (elapsed >= tenMin) {
                                                            showToast?.('Edit window expired (10 minutes elapsed)', 'error');
                                                        } else {
                                                            showToast?.('Maximum revisions reached (1 allowed)', 'error');
                                                        }
                                                    }
                                                }}
                                                canEdit={(() => {
                                                    if (!editedStudent.weCareSubmittedAt) return true;
                                                    const now = Date.now();
                                                    const tenMin = 10 * 60 * 1000;
                                                    const elapsed = now - editedStudent.weCareSubmittedAt;
                                                    return elapsed < tenMin && (editedStudent.weCareEditCount || 0) < 1;
                                                })()}
                                                editTimeRemaining={(() => {
                                                    if (!editedStudent.weCareSubmittedAt) return undefined;
                                                    const now = Date.now();
                                                    const tenMin = 10 * 60 * 1000;
                                                    const elapsed = now - editedStudent.weCareSubmittedAt;
                                                    if (elapsed >= tenMin || (editedStudent.weCareEditCount || 0) >= 1) return undefined;
                                                    const remaining = tenMin - elapsed;
                                                    const minutesLeft = Math.ceil(remaining / (60 * 1000));
                                                    return `Can edit: ${minutesLeft} min remaining`;
                                                })()}
                                            />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                <WeCareReportForm
                                                    student={editedStudent}
                                                    currentStaffName={currentStaff.name}
                                                    isEditing={!!editedStudent.weCareSubmittedAt}
                                                    initialActivity={editedStudent.weCareActivity || ''}
                                                    initialFirstAid={editedStudent.weCareFirstAid || []}
                                                    initialInfo={editedStudent.weCareInfo || ''}
                                                    onSave={(reportData) => {
                                                        const now = new Date();
                                                        const stamp = now.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                                                        const weCareReport: ParentReport = {
                                                            id: Date.now().toString(),
                                                            studentId: editedStudent.id,
                                                            studentName: `${editedStudent.firstName} ${editedStudent.lastName}`,
                                                            type: 'wecare',
                                                            message: `WE CARE REPORT\n\nDate: ${now.toLocaleDateString()}\nTime: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nSite: ${currentStaff.organization}\nActivity: ${reportData.activity}\n\nFirst Aid Given:\n${reportData.firstAid.map((f: string) => `[x] ${f}`).join('\n')}\n\nAdditional Information:\n${reportData.info}\n\nLead Signature: ${currentStaff.name}`,
                                                            method: 'both',
                                                            createdAt: now.toISOString(),
                                                            status: 'draft',
                                                            staffId: currentStaff.id
                                                        };

                                                        const updatedStudent = {
                                                            ...editedStudent,
                                                            weCareTimestamp: stamp,
                                                            weCareStaff: currentStaff.name,
                                                            weCareActivity: reportData.activity,
                                                            weCareFirstAid: reportData.firstAid,
                                                            weCareInfo: reportData.info,
                                                            weCareSubmittedAt: Date.now(),
                                                            weCareEditCount: (editedStudent.weCareEditCount || 0) + (editedStudent.weCareSubmittedAt ? 1 : 0)
                                                        };
                                                        setEditedStudent(updatedStudent);
                                                        setShowWeCareOptions(false);
                                                        setIsEditingWeCare(false);
                                                        handleSectionSave(updatedStudent);
                                                        if (onUpdateReport) onUpdateReport(weCareReport);
                                                        if (showToast) showToast('Draft saved! (We Care Report)', 'success');
                                                        setFiledReportType('wecare');
                                                    }}
                                                    onCancel={() => {
                                                        setShowWeCareOptions(false);
                                                        setIsEditingWeCare(false);
                                                    }}
                                                    darkMode={darkMode}
                                                />
                                                {editedStudent.weCareTimestamp && (
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>Stamped: {editedStudent.weCareTimestamp} by {editedStudent.weCareStaff}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {activeSection === 'injury' && !lockedSection && (
                                <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ padding: '16px' }}>
                                        {isHeadInjuryMonitoring() && timeLeft > 0 ? (
                                            <HeadInjuryChecklist
                                                student={editedStudent}
                                                currentStaffName={currentStaff.name}
                                                isLead={isLead}
                                                onUpdate={(updates, logs) => {
                                                    const merged = { ...editedStudent, ...updates };
                                                    if (logs) merged.headInjuryLogs = logs;
                                                    handleSectionSave(merged);
                                                }}
                                                darkMode={darkMode}
                                                timeLeft={timeLeft}
                                            />
                                        ) : (
                                            <HeadInjuryChecklist
                                                student={editedStudent}
                                                currentStaffName={currentStaff.name}
                                                isLead={isLead}
                                                onUpdate={(updates, logs) => {
                                                    const merged = { ...editedStudent, ...updates };
                                                    if (logs) merged.headInjuryLogs = logs;
                                                    handleSectionSave(merged);
                                                }}
                                                darkMode={darkMode}
                                            />
                                        )}

                                    </div>
                                </section>
                            )}

                            {activeSection === 'guardians' && isLead && (
                                <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                    {/* Guardian List V2 */}
                                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {(editedStudent.guardians || []).map((guardian, idx) => {
                                            if (editingGuardianIndex === idx) {
                                                const unavailableTypes = (editedStudent.guardians || [])
                                                    .filter((_, i) => i !== idx)
                                                    .map(g => g.type);
                                                return (
                                                    <React.Fragment key={idx}>
                                                        <GuardianAddForm
                                                            initialContact={guardian}
                                                            unavailableTypes={unavailableTypes}
                                                            onSave={handleSaveGuardian}
                                                            onCancel={() => setEditingGuardianIndex(null)}
                                                            onDelete={handleDeleteGuardian}
                                                            darkMode={darkMode}
                                                        />
                                                    </React.Fragment>
                                                );
                                            }

                                            return (
                                                <div key={idx} style={{ padding: '16px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{guardian.type} Contact</span>
                                                                {guardian.type === 'Contact 1' && <span className="material-icons-round" style={{ fontSize: '14px', color: '#6b7280' }}>star</span>}
                                                            </div>
                                                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginTop: '4px' }}>
                                                                {guardian.firstName} {guardian.lastName}
                                                            </div>
                                                        </div>
                                                        {isLead && (
                                                            <button onClick={() => setEditingGuardianIndex(idx)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
                                                                <span className="material-icons-round" style={{ fontSize: '18px' }}>edit</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>phone</span> {guardian.phone}
                                                            {guardian.notifySms && <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--color-success)', title: 'SMS Enabled' } as any}>sms</span>}
                                                        </div>
                                                        {guardian.email && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>email</span> {guardian.email}
                                                                {guardian.notifyEmail && <span className="material-icons-round" style={{ fontSize: '14px', color: '#8b5cf6', title: 'Email Enabled' } as any}>check_circle</span>}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {guardian.authStatus !== 'pending' && guardian.authorizedBy && (
                                                        <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#ecfdf5', borderRadius: '4px', border: '1px solid #10b981', color: '#047857', fontSize: '11px', fontWeight: '700' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>verified_user</span>
                                                            Authorized by {guardian.authorizedBy} ({guardian.authDate}){guardian.authRecordedBy && ` · recorded by ${guardian.authRecordedBy}`}
                                                        </div>
                                                    )}

                                                    {guardian.authStatus === 'pending' && (
                                                        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', fontSize: '12px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800' }}>
                                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>hourglass_top</span>
                                                                Awaiting approval{primaryGuardian ? ` from ${primaryGuardian.firstName} ${primaryGuardian.lastName}` : ''} · not allowed at pickup yet
                                                            </div>
                                                            <div style={{ marginTop: '2px' }}>Request sent {guardian.authRequestedAt}</div>
                                                            {isLead && (confirmApprovalIndex === idx ? (
                                                                <div style={{ marginTop: '10px' }}>
                                                                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                                                                        Only record this after {primaryGuardian ? primaryGuardian.firstName : 'the primary guardian'} has told you directly — by phone, in person, or by replying to the text — that {guardian.firstName} may pick up {editedStudent.firstName}.
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                                        <button onClick={() => setConfirmApprovalIndex(null)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #f59e0b', background: 'transparent', color: '#92400e', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                                                                        <button onClick={() => handleRecordApproval(idx)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: '#047857', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Record approval</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <button onClick={() => setConfirmApprovalIndex(idx)} style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #f59e0b', background: 'transparent', color: '#92400e', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>
                                                                    Record approval…
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Add Button or Form */}
                                        {isLead && !isAddingGuardian && (editedStudent.guardians || []).length < 3 && (
                                            <button onClick={() => setIsAddingGuardian(true)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                <span className="material-icons-round">add</span> Add Guardian Contact
                                            </button>
                                        )}

                                        {isAddingGuardian && (
                                            <GuardianAddForm
                                                onSave={handleSaveGuardian}
                                                onCancel={() => setIsAddingGuardian(false)}
                                                unavailableTypes={(editedStudent.guardians || []).map(g => g.type)}
                                                darkMode={darkMode}
                                            />
                                        )}
                                    </div>
                                </section>
                            )}

                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
};

export default StudentDetailModal;
