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
                        {activeSection === 'permissions' && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Staff Permissions Section</div>}
                        {activeSection === 'batch' && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Batch Operations Section</div>}
                        {activeSection === 'blocking' && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Student Access Section</div>}
                        {activeSection === 'reports' && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Parent Reports Section</div>}
                        {activeSection === 'biometric' && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Photo Review Section</div>}
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
                                ? `Allow ${confirmBlockStudent.firstName} ${confirmBlockStudent.lastName} to check in again?`
                                : `Prevent ${confirmBlockStudent.firstName} ${confirmBlockStudent.lastName} from checking in?`
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
