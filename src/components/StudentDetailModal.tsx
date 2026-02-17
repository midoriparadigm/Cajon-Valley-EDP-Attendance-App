// src/components/StudentDetailModal.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Student, Staff, GuardianContact, HeadInjuryLog, ParentReport, ProgramType, BiometricLog, BehaviorStatus, AttendanceStatus } from '../types';
import { BEHAVIOR_CHECKLISTS, BEHAVIOR_ROLE_DESCRIPTIONS } from '../constants';
import { sendSmsMock } from '../utils/sms';
import { MockDatabase } from '../utils/mock';
import { playAlarm } from '../utils/helpers';
import HeadInjuryChecklist from './HeadInjuryChecklist';
import CollapsedBehaviorView from './CollapsedBehaviorView';
import CollapsedWeCareView from './CollapsedWeCareView';
import CollapsedHeadInjuryView from './CollapsedHeadInjuryView';
import GuardianAddForm from './GuardianAddForm';
import WeCareReportForm from './WeCareReportForm';

interface StudentDetailModalProps {
    student: Student;
    onClose: () => void;
    onSave: (s: Student) => void;
    onCheckOut: (id: string, smsTime: string, checkOutBy?: string) => void;
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

    const handleSaveGuardian = (contact: GuardianContact) => {
        const updatedGuardians = [...(editedStudent.guardians || [])];

        if (editingGuardianIndex !== null) {
            updatedGuardians[editingGuardianIndex] = {
                ...updatedGuardians[editingGuardianIndex],
                ...contact,
            };
            setEditingGuardianIndex(null);
        } else {
            if (contact.type !== 'Contact 1') {
                const primary = updatedGuardians.find(g => g.type === 'Contact 1');
                if (primary) {
                    contact.authorizedBy = `${primary.firstName} ${primary.lastName}`;
                    contact.authDate = new Date().toLocaleDateString();
                    sendSmsMock(primary.phone, 'auth_request', {
                        guardian_name: `${contact.firstName} ${contact.lastName}`,
                        role_type: contact.type,
                        student_names: `${editedStudent.firstName}`
                    });
                }
            }
            updatedGuardians.push(contact);
            setIsAddingGuardian(false);
        }

        const updatedStudent = {
            ...editedStudent,
            guardians: updatedGuardians,
            contactLastUpdated: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setEditedStudent(updatedStudent);
        onSave(updatedStudent);
    };

    const handleDeleteGuardian = () => {
        if (editingGuardianIndex === null) return;
        const updatedGuardians = [...(editedStudent.guardians || [])];
        updatedGuardians.splice(editingGuardianIndex, 1);
        const updatedStudent = {
            ...editedStudent,
            guardians: updatedGuardians,
            contactLastUpdated: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setEditedStudent(updatedStudent);
        setEditingGuardianIndex(null);
        onSave(updatedStudent);
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

    const canEditBehaviorTicket = (student: Student): boolean => {
        if (!student.behaviorSubmittedAt) return true; // Not submitted yet

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
            behaviorTimestamp: stamp,
            behaviorStaff: currentStaff.name,
            behaviorStaffSupport: currentStaff.name
        });
        setBehaviorCollapsed(false);
        setShowTicketOptions(true);
        setIsEditingBehavior(true);
    };

    const handleLocalCheckOut = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        const activeGuardian = student.guardians?.find(g => g.type === checkoutBy) || student.guardians?.[0];
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

        const pendingUpdate = program === 'sunrise'
            ? { sunriseStatus: 'pending_parent' as AttendanceStatus }
            : { sunsetStatus: 'pending_parent' as AttendanceStatus };

        setEditedStudent(prev => ({ ...prev, ...pendingUpdate, smsSentTime: timeStr }));
        setShowCheckOutConfirm(false);
        onCheckOut(student.id, timeStr, checkoutBy);
    };

    const currentStatus = program === 'sunrise' ? editedStudent.sunriseStatus : editedStudent.sunsetStatus;
    const isPresent = currentStatus === 'present';

    const HeadInjuryIcon = ({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.5 2 6 4.5 6 7.5C6 8.5 6 10 6 11C5 11.5 4 12.5 4 14C4 16 5.5 17 6 17L6.5 21C6.5 21.5 7 22 7.5 22H12" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M12 2C13.5 2 15 2.8 16 4C17 5.2 17.5 6.5 17.5 7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <circle cx="16.5" cy="6" r="2.5" fill={color} opacity="0.3" stroke={color} strokeWidth="1.2" />
            <line x1="16" y1="1.5" x2="15.5" y2="3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="18.5" y1="2.5" x2="17.5" y2="3.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="20" y1="5" x2="18.5" y2="5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="9" cy="10" r="0.8" fill={color} />
            <path d="M8 14C8 14 9 15 10.5 14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
    );

    const studentMenuOptions = [
        { id: 'attendance', label: 'Attendance Record', icon: 'schedule', color: '#3b82f6', bg: '#dbeafe' },
        { id: 'behavior', label: 'Green Card Behavior Ticket', icon: 'warning', color: '#16a34a', bg: '#dcfce7' },
        { id: 'wecare', label: 'We Care Report', icon: 'medication', color: '#ec4899', bg: '#fce7f3' },
        { id: 'injury', label: 'Head Injury Report', icon: 'head_injury_custom', color: '#ef4444', bg: '#fee2e2' },
        ...(isLead ? [{ id: 'guardians', label: 'Guardian Contacts', icon: 'contact_phone', color: '#6366f1', bg: '#e0e7ff' }] : []),
    ];

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
                        {student.yearbookPhotoUrl ? (
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {studentMenuOptions.map(option => (
                                <button key={option.id} onClick={() => {
                                    setActiveSection(option.id as any);
                                    // Auto-trigger ticket/report creation flow for behavior and wecare sections
                                    if (option.id === 'behavior' && editedStudent.behavior === 'none') {
                                        startNewTicket();
                                    }
                                    if (option.id === 'wecare' && !editedStudent.weCareTimestamp) {
                                        setShowWeCareOptions(true);
                                        setIsEditingWeCare(true);
                                    }
                                }} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.1s, box-shadow 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: option.bg, color: option.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {option.icon === 'head_injury_custom' ? <HeadInjuryIcon size={28} color={option.color} /> : <span className="material-icons-round" style={{ fontSize: '28px' }}>{option.icon}</span>}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>{option.label}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tap to open</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Active Section View */}
            {activeSection && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: studentMenuOptions.find(o => o.id === activeSection)?.bg, color: studentMenuOptions.find(o => o.id === activeSection)?.color }}>
                                {studentMenuOptions.find(o => o.id === activeSection)?.icon === 'head_injury_custom' ? <HeadInjuryIcon size={24} color={studentMenuOptions.find(o => o.id === activeSection)?.color} /> : <span className="material-icons-round">{studentMenuOptions.find(o => o.id === activeSection)?.icon}</span>}
                            </div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>{studentMenuOptions.find(o => o.id === activeSection)?.label}</h3>
                        </div>
                        <button onClick={() => setActiveSection(null)} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '16px' }}>
                        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

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
                                                            <option key={g.type} value={g.type}>{g.type}: {g.firstName} {g.lastName}</option>
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

                            {activeSection === 'behavior' && (
                                <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-app)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                        {editedStudent.behavior !== 'none' && !isEditingBehavior && editedStudent.behaviorSubmittedAt && (
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
                                                                <div style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: 'minmax(550px, 1fr) minmax(500px, 1fr)',
                                                                    gap: '12px',
                                                                    maxHeight: 'calc(100vh - 180px)'
                                                                }}>
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

                                                                        {/* Buttons at bottom of left column */}
                                                                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                                                            <button onClick={cancelTicket} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                                                            <button onClick={saveBehavior} style={{ flex: 1, padding: '10px', backgroundColor: 'var(--color-success)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>{editedStudent.behaviorSubmittedAt ? 'Save Edit' : 'Submit'}</button>
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
                                                                                        const isChecked = editedStudent.behaviorIssues?.includes(item) || false;
                                                                                        const isDisabled = !!editedStudent.behaviorSubmittedAt;
                                                                                        return (
                                                                                            <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid var(--bg-app)' }}>
                                                                                                <span style={{ fontSize: '13px', color: 'var(--text-main)', flex: 1, paddingRight: '4px', fontWeight: '500' }}>{item}</span>
                                                                                                <button
                                                                                                    disabled={isDisabled}
                                                                                                    onClick={() => {
                                                                                                        const issues = editedStudent.behaviorIssues.includes(item) ? editedStudent.behaviorIssues.filter(i => i !== item) : [...editedStudent.behaviorIssues, item];
                                                                                                        setEditedStudent({ ...editedStudent, behaviorIssues: issues });
                                                                                                    }}
                                                                                                    style={{
                                                                                                        width: '36px', height: '26px', borderRadius: '6px', flexShrink: 0,
                                                                                                        border: isChecked ? '2px solid var(--color-success)' : '1px solid var(--border-subtle)',
                                                                                                        backgroundColor: isChecked ? 'var(--color-success-bg)' : 'var(--bg-card)',
                                                                                                        color: isChecked ? 'var(--color-success)' : 'var(--text-secondary)',
                                                                                                        fontWeight: '800', fontSize: '14px', cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                                                        opacity: isDisabled ? 0.5 : 1,
                                                                                                        transition: 'all 0.2s ease'
                                                                                                    }}
                                                                                                >{isChecked ? '✓' : '—'}</button>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}

                                                        {editedStudent.behavior === 'none' && showTicketOptions && (
                                                            <button onClick={() => setShowTicketOptions(false)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {activeSection === 'wecare' && (
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

                            {activeSection === 'injury' && (
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

                                                    {guardian.authorizedBy && (
                                                        <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#ecfdf5', borderRadius: '4px', border: '1px solid #10b981', color: '#047857', fontSize: '11px', fontWeight: '700' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>verified_user</span>
                                                            Authorized by {guardian.authorizedBy} ({guardian.authDate})
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
