// src/components/LeaderDashboard.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Student, Staff, ParentReport, BiometricLog, ProgramType } from '../types';
import { GRADES } from '../constants';
import RosterManager from './RosterManager';

interface LeaderDashboardProps {
    user: Staff;
    students: Student[];
    onClose: () => void;
    onImport: (students: Student[]) => void;
    onAddStudent: (s: Student) => void;
    onUpdateStaff: (staff: Staff[]) => void;
    onUpdateStudent: (s: Student) => void;
    staffList: Staff[];
    parentReports: ParentReport[];
    biometricLogs: BiometricLog[];
    isInline?: boolean;
    onUpdateReport?: (report: ParentReport) => void;
    onScheduleBatchCheckout: (time: string | null) => void;
    showToast: (msg: string, type: any) => void;
    isBatchDefaultEnabled: boolean;
    setIsBatchDefaultEnabled: (v: boolean) => void;
    defaultBatchTime: string;
    setDefaultBatchTime: (t: string) => void;
    scheduledBatchCheckoutTime: string | null;
    darkMode: boolean;
}

const LeaderDashboard = (props: LeaderDashboardProps) => {
    const { user, students, onClose, onImport, onAddStudent, onUpdateStaff, onUpdateStudent, staffList, parentReports, biometricLogs, isInline, onUpdateReport, onScheduleBatchCheckout, showToast, isBatchDefaultEnabled, setIsBatchDefaultEnabled, defaultBatchTime, setDefaultBatchTime, scheduledBatchCheckoutTime, darkMode } = props;

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-app)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingTop: '80px'
    };

    const [activeSection, setActiveSection] = useState<'roster' | 'permissions' | 'batch' | 'blocking' | 'reports' | 'biometric' | null>(null);
    const [localStaff, setLocalStaff] = useState<Staff[]>(staffList);
    const [sunriseBatchTime, setSunriseBatchTime] = useState(defaultBatchTime || '08:00');
    const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);
    const [countdown, setCountdown] = useState<string>('00:00:00:00');
    const [selectedDraft, setSelectedDraft] = useState<ParentReport | null>(null);
    const [selectedReportStudentId, setSelectedReportStudentId] = useState<string | null>(null);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [selectedAccessGrade, setSelectedAccessGrade] = useState<string | null>(null);
    const [editingReport, setEditingReport] = useState<ParentReport | null>(null);
    const [editingReportText, setEditingReportText] = useState('');
    const [sendViaEmail, setSendViaEmail] = useState(true);
    const [sendViaSms, setSendViaSms] = useState(true);

    const menuOptions = [
        { id: 'roster', label: 'Roster Management', icon: 'groups', color: '#3b82f6', bg: '#dbeafe' },
        { id: 'reports', label: `Parent Reports (${parentReports.length})`, icon: 'assignment', color: '#f59e0b', bg: '#fef3c7' },
        { id: 'permissions', label: 'Staff Permissions', icon: 'admin_panel_settings', color: '#8b5cf6', bg: '#f3e8ff' },
        { id: 'blocking', label: 'Student Access', icon: 'block', color: '#ef4444', bg: '#fee2e2' },
        { id: 'batch', label: 'Batch Operations', icon: 'checklist_rtl', color: '#10b981', bg: '#d1fae5' },
        { id: 'biometric', label: 'Photo Review', icon: 'face', color: '#6366f1', bg: '#e0e7ff' },
    ];

    useEffect(() => {
        if (!scheduledBatchCheckoutTime) return;
        const interval = setInterval(() => {
            const now = new Date();
            const [h, m] = scheduledBatchCheckoutTime.split(':').map(Number);
            const target = new Date();
            target.setHours(h, m, 0, 0);
            const diff = target.getTime() - now.getTime();
            if (diff <= 0) {
                setCountdown('00:00:00:00');
                clearInterval(interval);
            } else {
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setCountdown(`${String(d).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [scheduledBatchCheckoutTime]);

    const [blockSearch, setBlockSearch] = useState('');
    const [confirmBlockStudent, setConfirmBlockStudent] = useState<Student | null>(null);

    const toggleStaffCheckIn = (staffId: string) => {
        try {
            const updated = localStaff.map(s => s.id === staffId ? { ...s, canCheckIn: !s.canCheckIn } : s);
            setLocalStaff(updated);
            onUpdateStaff(updated);
        } catch (err) {
            console.error('Failed to toggle staff check-in:', err);
        }
    };

    const toggleStaffAdminTasks = (staffId: string) => {
        try {
            const updated = localStaff.map(s => s.id === staffId ? { ...s, canAdminTasks: !s.canAdminTasks } : s);
            setLocalStaff(updated);
            onUpdateStaff(updated);
        } catch (err) {
            console.error('Failed to toggle staff admin tasks:', err);
        }
    };

    const toggleStaffCheckOut = (staffId: string) => {
        const updated = localStaff.map(s => s.id === staffId ? { ...s, canCheckOut: !s.canCheckOut } : s);
        setLocalStaff(updated);
        onUpdateStaff(updated);
    };

    const toggleStaffHir = (staffId: string) => {
        const updated = localStaff.map(s => s.id === staffId ? { ...s, canHir: !s.canHir } : s);
        setLocalStaff(updated);
        onUpdateStaff(updated);
    };

    const toggleStaffWeCare = (staffId: string) => {
        const updated = localStaff.map(s => s.id === staffId ? { ...s, canWeCare: !s.canWeCare } : s);
        setLocalStaff(updated);
        onUpdateStaff(updated);
    };

    const toggleGradeAssignment = (staffId: string, grade: string) => {
        const updated = localStaff.map(s => {
            if (s.id !== staffId) return s;
            const currentGrades = s.assignedGrades || [];
            const newGrades = currentGrades.includes(grade)
                ? currentGrades.filter(g => g !== grade)
                : [...currentGrades, grade];
            return { ...s, assignedGrades: newGrades };
        });
        setLocalStaff(updated);
        onUpdateStaff(updated);
    };

    const handleSunriseBatchCheckout = () => {
        setShowScheduleConfirm(true);
    };

    const confirmSchedule = () => {
        const [h, m] = sunriseBatchTime.split(':').map(Number);
        let hour24 = h;
        if (h === 12) hour24 = 0;
        const time24 = `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (isBatchDefaultEnabled) {
            setDefaultBatchTime(sunriseBatchTime);
        }
        onScheduleBatchCheckout(time24);
        setShowScheduleConfirm(false);
    };

    const isFutureTime = () => {
        if (!sunriseBatchTime || !sunriseBatchTime.includes(':')) return false;
        const parts = sunriseBatchTime.split(':');
        if (parts.length !== 2) return false;
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        if (isNaN(h) || isNaN(m)) return false;
        if (h < 1 || h > 12 || m < 0 || m > 59) return false;
        const now = new Date();
        const sched = new Date();
        let hour24 = h;
        if (h === 12) hour24 = 0;
        sched.setHours(hour24, m, 0, 0);
        return sched > now;
    };

    const toggleAllGrades = (staffId: string) => {
        const updated = localStaff.map(s => {
            if (s.id !== staffId) return s;
            const allGrades = GRADES.filter(g => g !== 'All');
            const isCurrentlyAll = (s.assignedGrades || []).length === allGrades.length;
            return { ...s, assignedGrades: isCurrentlyAll ? [] : allGrades };
        });
        setLocalStaff(updated);
        onUpdateStaff(updated);
    };

    const toggleStudentBlock = (student: Student) => {
        setConfirmBlockStudent(student);
    };

    const handleConfirmBlock = () => {
        if (confirmBlockStudent) {
            onUpdateStudent({ ...confirmBlockStudent, isCheckInBlocked: !confirmBlockStudent.isCheckInBlocked });
            setConfirmBlockStudent(null);
        }
    };

    // Note: The render JSX is continued in the return statement
    // This component uses a large amount of inline styles for sections

    return (
        <div style={containerStyle}>
            {/* Menu View */}
            {!activeSection && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span className="material-icons-round" style={{ fontSize: '32px' }}>dashboard</span> Leader Dashboard
                        </h2>
                        <button onClick={onClose} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Close Dashboard">
                            <span className="material-icons-round" style={{ fontSize: '24px' }}>close</span>
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
                        {menuOptions.map(option => (
                            <button key={option.id} onClick={() => setActiveSection(option.id as any)} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.1s, box-shadow 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: option.bg, color: option.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <span className="material-icons-round" style={{ fontSize: '28px' }}>{option.icon}</span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>{option.label}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tap to open</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Active Section View - partial implementation */}
            {activeSection && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: menuOptions.find(o => o.id === activeSection)?.bg, color: menuOptions.find(o => o.id === activeSection)?.color }}>
                                <span className="material-icons-round">{menuOptions.find(o => o.id === activeSection)?.icon}</span>
                            </div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>{menuOptions.find(o => o.id === activeSection)?.label}</h2>
                        </div>
                        <button onClick={() => setActiveSection(null)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Back to Menu">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                        {activeSection === 'roster' && <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}><RosterManager onImport={onImport} onAdd={onAddStudent} showToast={showToast} /></div>}
                        {activeSection === 'permissions' && (
                            <div style={{ padding: '20px' }}>
                                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>Staff Permissions</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {localStaff.map(staff => (
                                            <div key={staff.id} style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                                    <div>
                                                        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>{staff.name}</div>
                                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{staff.role} • {staff.organization}</div>
                                                    </div>
                                                    {staff.id !== 's1' && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '180px' }}>
                                                                <span style={{ fontSize: '13px', fontWeight: '600' }}>Can Check-In</span>
                                                                <button title="Toggle Check-In Permission" onClick={() => toggleStaffCheckIn(staff.id)} style={{ width: '48px', height: '28px', borderRadius: '14px', backgroundColor: staff.canCheckIn ? 'var(--color-toggle-active)' : 'var(--bg-input)', position: 'relative', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: staff.canCheckIn ? '22px' : '2px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }} />
                                                                </button>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '180px' }}>
                                                                    <span style={{ fontSize: '13px', fontWeight: '600' }}>Admin Tasks</span>
                                                                    <button title="Toggle Admin Tasks Permission" onClick={() => toggleStaffAdminTasks(staff.id)} style={{ width: '48px', height: '28px', borderRadius: '14px', backgroundColor: staff.canAdminTasks ? 'var(--color-toggle-active)' : 'var(--bg-input)', position: 'relative', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: staff.canAdminTasks ? '22px' : '2px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }} />
                                                                    </button>
                                                                </div>
                                                                {staff.canAdminTasks && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--border-subtle)', marginLeft: '8px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '160px' }}>
                                                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Check-Out</span>
                                                                            <button title="Toggle Check-Out Permission" onClick={() => toggleStaffCheckOut(staff.id)} style={{ width: '48px', height: '28px', borderRadius: '14px', backgroundColor: staff.canCheckOut ? 'var(--color-toggle-active)' : 'var(--bg-input)', position: 'relative', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: staff.canCheckOut ? '22px' : '2px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }} />
                                                                            </button>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '160px' }}>
                                                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>HIR Quest.</span>
                                                                            <button title="Toggle HIR Permission" onClick={() => toggleStaffHir(staff.id)} style={{ width: '48px', height: '28px', borderRadius: '14px', backgroundColor: staff.canHir ? 'var(--color-toggle-active)' : 'var(--bg-input)', position: 'relative', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: staff.canHir ? '22px' : '2px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }} />
                                                                            </button>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '160px' }}>
                                                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>We Care Rep.</span>
                                                                            <button title="Toggle We Care Permission" onClick={() => toggleStaffWeCare(staff.id)} style={{ width: '48px', height: '28px', borderRadius: '14px', backgroundColor: staff.canWeCare ? 'var(--color-toggle-active)' : 'var(--bg-input)', position: 'relative', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: staff.canWeCare ? '22px' : '2px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ margin: '12px 0' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Assigned Grades</div>
                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                        {GRADES.filter(g => g !== 'All').map(g => (
                                                            <button key={g} onClick={() => toggleGradeAssignment(staff.id, g)} style={{ padding: '6px 12px', borderRadius: '8px', border: (staff.assignedGrades || []).includes(g) ? '1px solid var(--text-main)' : '1px solid var(--border-subtle)', backgroundColor: (staff.assignedGrades || []).includes(g) ? 'var(--text-main)' : 'transparent', color: (staff.assignedGrades || []).includes(g) ? 'var(--bg-card)' : 'var(--text-main)', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                                                                {g}
                                                            </button>
                                                        ))}
                                                        <button onClick={() => toggleAllGrades(staff.id)} style={{ padding: '6px 12px', borderRadius: '8px', border: (staff.assignedGrades || []).length === GRADES.filter(g => g !== 'All').length ? '1px solid var(--text-main)' : '1px solid var(--border-subtle)', backgroundColor: (staff.assignedGrades || []).length === GRADES.filter(g => g !== 'All').length ? 'var(--text-main)' : 'transparent', color: (staff.assignedGrades || []).length === GRADES.filter(g => g !== 'All').length ? 'var(--bg-card)' : 'var(--text-main)', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                                                            All
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeSection === 'batch' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: isInline ? '16px' : '24px' }}>
                                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-lg)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                                            <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'var(--color-sunrise)', color: 'white' }}>
                                                <span className="material-icons-round">wb_sunny</span>
                                            </div>
                                            <div />
                                        </div>
                                        <div style={{ margin: '24px 0', padding: '20px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>Checkout Time</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Set as Default</span>
                                                    <button title="Set current time as default" onClick={() => setIsBatchDefaultEnabled(!isBatchDefaultEnabled)} style={{ width: '36px', height: '20px', borderRadius: '10px', backgroundColor: isBatchDefaultEnabled ? 'var(--color-success)' : '#d1d5db', position: 'relative', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '1px', left: isBatchDefaultEnabled ? '18px' : '1px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Hour</div>
                                                    <div style={{ height: '120px', overflowY: 'auto', width: '60px', scrollSnapType: 'y mandatory', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)', padding: '40px 0' }} className="hide-scrollbar">
                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                                            <div key={h} onClick={() => { const [_, m] = sunriseBatchTime.split(':'); setSunriseBatchTime(`${String(h)}:${m || '00'}`); }} style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: sunriseBatchTime.split(':')[0] === String(h) ? '800' : '600', color: sunriseBatchTime.split(':')[0] === String(h) ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer', scrollSnapAlign: 'center', transition: 'all 0.2s' }}>
                                                                {h}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-muted)', marginTop: '12px' }}>:</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Min</div>
                                                    <div style={{ height: '120px', overflowY: 'auto', width: '60px', scrollSnapType: 'y mandatory', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)', padding: '40px 0' }} className="hide-scrollbar">
                                                        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                                            <div key={m} onClick={() => { const [h] = sunriseBatchTime.split(':'); setSunriseBatchTime(`${h || '8'}:${m}`); }} style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: sunriseBatchTime.split(':')[1] === m ? '800' : '600', color: sunriseBatchTime.split(':')[1] === m ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer', scrollSnapAlign: 'center', transition: 'all 0.2s' }}>
                                                                {m}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)', marginTop: '12px' }}>
                                                    <span className="material-icons-round" style={{ fontSize: '20px' }}>wb_sunny</span>
                                                    <span style={{ fontWeight: '800', fontSize: '15px' }}>AM</span>
                                                </div>
                                            </div>
                                            <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0', fontSize: '14px' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Students Eligible:</span>
                                            <span style={{ fontWeight: '800', fontSize: '18px', color: '#8b5cf6' }}>{students.filter(s => s.sunriseStatus === 'present' || s.sunriseStatus === 'pending_parent').length}</span>
                                        </div>
                                        {scheduledBatchCheckoutTime ? (
                                            <div style={{ textAlign: 'center', padding: '24px', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: '16px', border: '2px dashed #8b5cf6' }}>
                                                <div style={{ fontSize: '12px', fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Executing in</div>
                                                <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--text-main)', fontFamily: 'monospace' }}>{countdown}</div>
                                                <button onClick={() => onScheduleBatchCheckout(null)} style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancel Schedule</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setSunriseBatchTime('')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                                                <button onClick={handleSunriseBatchCheckout} disabled={!isFutureTime()} style={{ flex: 2, padding: '16px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', opacity: isFutureTime() ? 1 : 0.5 }}>
                                                    Run Batch Checkout
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeSection === 'blocking' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-app)', position: 'relative' }}>
                                <div style={{ zIndex: 10, backgroundColor: 'var(--bg-header)', boxShadow: 'var(--shadow-sm)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                    <header style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', flexShrink: 0 }}>
                                                <span className="material-icons-round" style={{ fontSize: '20px' }}>admin_panel_settings</span>
                                            </div>
                                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Student Check-In Access</h3>
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500' }}>Administrative Control</div>
                                            </div>
                                        </div>
                                    </header>
                                    <div style={{ padding: '0 16px 16px 16px' }}>
                                        <div style={{ position: 'relative', marginBottom: '16px', width: '100%' }}>
                                            <span className="material-icons-round" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: darkMode ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)', fontSize: '20px' }}>search</span>
                                            <input type="text" placeholder="Search student to manage access..." value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: '16px', border: 'none', backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : '#f3f4f6', fontSize: '16px', color: darkMode ? 'white' : 'var(--text-main)', boxSizing: 'border-box', outline: 'none' }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <button onClick={() => setSelectedAccessGrade(prev => prev === 'All' ? null : 'All')} style={{ padding: '10px 16px', borderRadius: '12px', border: 'none', backgroundColor: selectedAccessGrade === 'All' ? 'var(--text-main)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'), color: selectedAccessGrade === 'All' ? 'var(--bg-card)' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'), fontWeight: '800', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s ease', minWidth: '48px' }}>
                                                All
                                            </button>
                                            {GRADES.map(g => (
                                                <button key={g} onClick={() => setSelectedAccessGrade(prev => prev === g ? null : g)} style={{ padding: '10px 16px', borderRadius: '12px', border: 'none', backgroundColor: selectedAccessGrade === g ? 'var(--text-main)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'), color: selectedAccessGrade === g ? 'var(--bg-card)' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'), fontWeight: '800', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s ease', minWidth: '48px' }}>
                                                    {g}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', overscrollBehaviorY: 'none', padding: '24px' }}>
                                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {students
                                                .filter(s => (s.firstName.toLowerCase() + ' ' + s.lastName.toLowerCase()).includes(blockSearch.toLowerCase()))
                                                .filter(s => !selectedAccessGrade || selectedAccessGrade === 'All' || s.grade === selectedAccessGrade)
                                                .map(student => (
                                                    <div key={student.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', opacity: student.isCheckInBlocked ? 0.8 : 1, borderLeft: student.isCheckInBlocked ? '4px solid var(--color-danger)' : '1px solid var(--border-subtle)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>{student.grade}</div>
                                                            <div>
                                                                <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{student.firstName} {student.lastName}</div>
                                                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                                    {student.programs.includes('ELOP') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '700' }}>ELOP</span>}
                                                                    {student.programs.includes('ASES') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#6b21a8', fontWeight: '700' }}>ASES</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => toggleStudentBlock(student)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: student.isCheckInBlocked ? 'var(--color-danger-bg)' : 'var(--bg-hover)', color: student.isCheckInBlocked ? 'var(--color-danger)' : 'var(--text-main)', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                                                            {student.isCheckInBlocked ? 'No Check-In' : 'Active'}
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeSection === 'reports' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: isInline ? '16px' : '24px' }}>
                                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>Parent Reports</h3>
                                    {parentReports.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                            <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px' }}>description</span>
                                            <div style={{ fontWeight: '600' }}>No reports yet</div>
                                            <div style={{ fontSize: '14px' }}>Reports will appear here when created from incidents</div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {selectedReportStudentId ? (
                                                <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>{parentReports.find(r => r.studentId === selectedReportStudentId)?.studentName}</h4>
                                                        <button onClick={() => setSelectedReportStudentId(null)} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
                                                            <span className="material-icons-round">arrow_back</span>
                                                        </button>
                                                    </div>
                                                    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                            {['behavior', 'injury', 'wecare'].map(type => {
                                                                const filtered = parentReports.filter(r => r.studentId === selectedReportStudentId && r.type === type);
                                                                if (filtered.length === 0) return null;
                                                                return (
                                                                    <div key={type}>
                                                                        <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>{type === 'behavior' ? 'traffic' : type === 'injury' ? 'personal_injury' : 'medication'}</span>
                                                                            {type === 'behavior' ? 'Behavior Tickets' : type === 'injury' ? 'Head Injury Reports' : 'We Care Reports'}
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                            {filtered.map(report => (
                                                                                <div key={report.id} style={{ padding: '12px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                                                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>{new Date(report.createdAt).toLocaleDateString()}</div>
                                                                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{report.status === 'sent' ? '✓ Sent' : 'Draft'}</div>
                                                                                    </div>
                                                                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{report.message}</div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {/* Conditional button logic: 1 report = Edit/Generate, 2+ = Comprehensive Draft */}
                                                            {(() => {
                                                                const sReports = parentReports.filter(r => r.studentId === selectedReportStudentId);
                                                                if (sReports.length === 1) {
                                                                    const report = sReports[0];
                                                                    return editingReport?.id === report.id ? (
                                                                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                                                            <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Edit Report Message</label>
                                                                            <textarea
                                                                                value={editingReportText}
                                                                                onChange={(e) => setEditingReportText(e.target.value)}
                                                                                style={{ width: '100%', minHeight: '120px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                                                                                placeholder="Edit the report message..."
                                                                            />
                                                                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                                                    <input type="checkbox" checked={sendViaEmail} onChange={(e) => setSendViaEmail(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                                                                                    <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>Email</span>
                                                                                </label>
                                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                                                    <input type="checkbox" checked={sendViaSms} onChange={(e) => setSendViaSms(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                                                                                    <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>SMS</span>
                                                                                </label>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                                <button onClick={() => setEditingReport(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                                                                                <button onClick={() => {
                                                                                    const updatedReport = { ...report, message: editingReportText, method: (sendViaEmail && sendViaSms) ? 'both' : sendViaEmail ? 'email' : 'sms' };
                                                                                    if (onUpdateReport) onUpdateReport(updatedReport as ParentReport);
                                                                                    setEditingReport(null);
                                                                                    showToast('Report updated!', 'success');
                                                                                }} style={{ flex: 1, padding: '12px', borderRadius: '8px', backgroundColor: 'var(--color-success)', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}>Save Changes</button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => { setEditingReport(report); setEditingReportText(report.message); }}
                                                                            style={{ width: '100%', padding: '14px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}
                                                                        >
                                                                            <span className="material-icons-round">edit_note</span>
                                                                            EDIT / GENERATE
                                                                        </button>
                                                                    );
                                                                } else {
                                                                    return (
                                                                        <button
                                                                            onClick={() => {
                                                                                const compiler = `COMPREHENSIVE DAILY REPORT - ${sReports[0].studentName}\n\n` + sReports.map(r => `[${r.type.toUpperCase()}] ${new Date(r.createdAt).toLocaleDateString()}\n${r.message.split('\n').filter(line => line.length > 0).slice(0, 3).join('\n')}...`).join('\n\n');
                                                                                const comprehensiveReport: ParentReport = { id: `comp-${Date.now()}`, studentId: selectedReportStudentId, studentName: sReports[0].studentName, type: 'behavior', message: compiler, method: 'both', status: 'draft', createdAt: new Date().toISOString(), staffId: user.id };
                                                                                if (onUpdateReport) onUpdateReport(comprehensiveReport);
                                                                                showToast('Comprehensive draft generated!', 'success');
                                                                            }}
                                                                            style={{ width: '100%', padding: '14px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}
                                                                        >
                                                                            <span className="material-icons-round">auto_fix_high</span>
                                                                            GENERATE COMPREHENSIVE DRAFT
                                                                        </button>
                                                                    );
                                                                }
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {Array.from(new Set(parentReports.map(r => r.studentId))).map(sid => {
                                                        const studentReports = parentReports.filter(r => r.studentId === sid);
                                                        const sName = studentReports[0].studentName;
                                                        const hasDrafts = studentReports.some(r => r.status === 'draft');
                                                        return (
                                                            <div key={sid} style={{ padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setSelectedReportStudentId(sid)}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: 'var(--text-main)', border: '1px solid var(--border-subtle)' }}>
                                                                            {sName.charAt(0)}
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontWeight: '800', fontSize: '16px', color: 'var(--text-main)' }}>{sName}</div>
                                                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{studentReports.length} Report{studentReports.length > 1 ? 's' : ''}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        {hasDrafts && <span style={{ padding: '4px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: '800', backgroundColor: '#fef3c7', color: '#d97706', textTransform: 'uppercase' }}>Drafts Pending</span>}
                                                                        <span className="material-icons-round" style={{ color: 'var(--text-muted)' }}>chevron_right</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeSection === 'biometric' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: isInline ? '16px' : '24px' }}>
                                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="material-icons-round">face</span> Photo Verification Review
                                    </h3>
                                    {biometricLogs.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                                            <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px' }}>no_photography</span>
                                            <div style={{ fontWeight: '600' }}>No verification logs yet</div>
                                            <div style={{ fontSize: '14px' }}>Logs will appear here after student check-ins</div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {biometricLogs.map(log => (
                                                <div key={log.id} style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)', borderLeft: log.anomalyDetected ? '6px solid #f97316' : '1px solid var(--border-subtle)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                {log.studentName}
                                                                {log.anomalyDetected && (
                                                                    <span style={{ padding: '4px 12px', borderRadius: '20px', backgroundColor: '#fff7ed', color: '#ea580c', fontSize: '11px', fontWeight: '800', border: '1px solid #ffedd5', textTransform: 'uppercase' }}>
                                                                        Visual Anomaly Detected
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                                Log ID: {log.id} • {log.timestamp}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Identity Match</div>
                                                            <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--color-success)' }}>{(log.matchScore * 100).toFixed(0)}%</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ height: '140px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border-subtle)', marginBottom: '8px' }}>
                                                                <img src={log.yearbookPhoto} alt="Yearbook" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            </div>
                                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Yearbook</div>
                                                        </div>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ height: '140px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border-subtle)', marginBottom: '8px' }}>
                                                                <img src={log.previousPhoto} alt="Previous Day" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            </div>
                                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Previous Day</div>
                                                        </div>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ height: '140px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', overflow: 'hidden', border: `3px solid ${log.anomalyDetected ? '#f97316' : '#8b5cf6'}`, marginBottom: '8px' }}>
                                                                {log.livePhoto ? (
                                                                    <img src={log.livePhoto} alt="Live Capture" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                                                                        <span className="material-icons-round" style={{ color: 'white' }}>no_photography</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '11px', fontWeight: '800', color: log.anomalyDetected ? '#ea580c' : '#8b5cf6', textTransform: 'uppercase' }}>Check-In Capture</div>
                                                        </div>
                                                    </div>
                                                    {log.anomalyDetected && (
                                                        <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fff7ed', borderRadius: '12px', border: '1px solid #ffedd5', fontSize: '13px', color: '#9a3412', display: 'flex', gap: '10px' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>warning</span>
                                                            <div>
                                                                <strong>Anomaly Detected:</strong> This student's current appearance significantly deviates from their previous check-in (Variance: {(log.anomalyScore * 100).toFixed(1)}%). Review for potential injury or unverified identity.
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showScheduleConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '32px', borderRadius: '24px', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(139,92,246,0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <span className="material-icons-round" style={{ fontSize: '32px' }}>schedule</span>
                        </div>
                        <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Confirm Batch Schedule</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '15px', lineHeight: '1.5' }}>
                            Schedule automatic check-out for all students at <strong>{sunriseBatchTime} AM</strong>?
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowScheduleConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={confirmSchedule} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer' }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmBlockStudent && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>
                            {confirmBlockStudent.isCheckInBlocked ? 'Restore Check-In Access?' : 'Remove Check-In Access?'}
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            {confirmBlockStudent.isCheckInBlocked
                                ? `Allow ${confirmBlockStudent.firstName} ${confirmBlockStudent.lastName} to check-in again?`
                                : `Prevent ${confirmBlockStudent.firstName} ${confirmBlockStudent.lastName} from checking-in?`
                            }
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setConfirmBlockStudent(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleConfirmBlock} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
                                {confirmBlockStudent.isCheckInBlocked ? 'Restore Access' : 'Confirm No Check-In'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeaderDashboard;
