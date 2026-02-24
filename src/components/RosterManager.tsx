// src/components/RosterManager.tsx
import React, { useState, useRef } from 'react';
import type { Student, GuardianContact, SubProgram } from '../types';
import { GRADES } from '../constants';
import GuardianAddForm from './GuardianAddForm';

interface RosterManagerProps {
    onImport: (s: Student[]) => void;
    onAdd: (s: Student) => void;
    showToast: (msg: string, type: any) => void;
    darkMode?: boolean;
}

const EMPTY_STUDENT = () => ({
    firstName: '',
    lastName: '',
    grade: 'Grade',
    elopId: '',
    asesId: '',
    guardians: [] as GuardianContact[],
});

const RosterManager = ({ onImport, onAdd, showToast, darkMode = false }: RosterManagerProps) => {
    const [manualStudent, setManualStudent] = useState(EMPTY_STUDENT());
    const [isAddingGuardian, setIsAddingGuardian] = useState(false);
    const [editingGuardianIndex, setEditingGuardianIndex] = useState<number | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const newStudents: Student[] = [
                { id: 'new1', elopId: '9001', firstName: 'New', lastName: 'Student', grade: '1', guardians: [{ type: 'Contact 1', firstName: 'Guardian', lastName: 'Name', phone: '', email: '' }], programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [] }
            ];
            onImport(newStudents);
            alert('Roster Imported Successfully');
        }
    };

    const handleSaveGuardian = (g: GuardianContact) => {
        if (editingGuardianIndex !== null) {
            const updated = [...manualStudent.guardians];
            updated[editingGuardianIndex] = g;
            setManualStudent({ ...manualStudent, guardians: updated });
            setEditingGuardianIndex(null);
        } else {
            setManualStudent({ ...manualStudent, guardians: [...manualStudent.guardians, g] });
            setIsAddingGuardian(false);
        }
    };

    const handleDeleteGuardian = (idx: number) => {
        const updated = manualStudent.guardians.filter((_, i) => i !== idx);
        setManualStudent({ ...manualStudent, guardians: updated });
        setEditingGuardianIndex(null);
    };

    const unavailableTypes = manualStudent.guardians.map(g => g.type);
    const canAddMore = manualStudent.guardians.length < 5;

    return (
        <div style={{ padding: '20px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', marginBottom: '20px', border: '1px solid var(--border-subtle)', marginTop: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Roster Management</h3>
            <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>Bulk Import CSV</label>
                    <input type="file" accept=".csv" onChange={handleFileUpload} style={{ flex: 1 }} />
                </div>
            </div>
            <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>Add Student</label>

                {/* Student Info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                    <input placeholder="First Name" value={manualStudent.firstName} onChange={e => setManualStudent({ ...manualStudent, firstName: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                    <input placeholder="Last Name" value={manualStudent.lastName} onChange={e => setManualStudent({ ...manualStudent, lastName: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                    <input placeholder="ELOP ID" value={manualStudent.elopId} onChange={e => setManualStudent({ ...manualStudent, elopId: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                    <input placeholder="ASES ID" value={manualStudent.asesId} onChange={e => setManualStudent({ ...manualStudent, asesId: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                    <select title="Select Grade" value={manualStudent.grade} onChange={e => setManualStudent({ ...manualStudent, grade: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}>
                        <option value="Grade">Grade</option>
                        {GRADES.filter(g => g !== 'All').map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>

                {/* Guardian Contacts — same pattern as student detail page */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '12px', fontSize: '13px', fontWeight: '600' }}>Guardian Contacts</label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Existing guardian cards */}
                        {manualStudent.guardians.map((guardian, idx) => {
                            if (editingGuardianIndex === idx) {
                                return (
                                    <React.Fragment key={idx}>
                                        <GuardianAddForm
                                            initialContact={guardian}
                                            unavailableTypes={manualStudent.guardians.filter((_, i) => i !== idx).map(g => g.type)}
                                            onSave={handleSaveGuardian}
                                            onCancel={() => setEditingGuardianIndex(null)}
                                            onDelete={() => handleDeleteGuardian(idx)}
                                            darkMode={darkMode}
                                        />
                                    </React.Fragment>
                                );
                            }
                            return (
                                <div key={idx} style={{ padding: '14px 16px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{guardian.type} Contact</span>
                                                {guardian.type === 'Contact 1' && <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>star</span>}
                                            </div>
                                            <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)' }}>{guardian.firstName} {guardian.lastName}</div>
                                            {guardian.phone && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>phone</span>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{guardian.phone}</span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setEditingGuardianIndex(idx)}
                                            style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Add guardian form */}
                        {isAddingGuardian && (
                            <GuardianAddForm
                                unavailableTypes={unavailableTypes}
                                onSave={handleSaveGuardian}
                                onCancel={() => setIsAddingGuardian(false)}
                                darkMode={darkMode}
                            />
                        )}

                        {/* Add guardian button */}
                        {!isAddingGuardian && !editingGuardianIndex !== null && canAddMore && (
                            <button
                                onClick={() => setIsAddingGuardian(true)}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px dashed var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--color-primary)', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>add</span>
                                Add Guardian Contact
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <button onClick={() => {
                        if (!manualStudent.firstName || !manualStudent.lastName || manualStudent.grade === 'Grade') {
                            showToast('Please fill Name and Grade', 'error');
                            return;
                        }
                        if (!manualStudent.guardians[0]?.firstName) {
                            showToast('Primary Guardian (Contact 1) is required', 'error');
                            return;
                        }
                        const newPrograms: SubProgram[] = [];
                        if (manualStudent.elopId) newPrograms.push('ELOP');
                        if (manualStudent.asesId) newPrograms.push('ASES');

                        onAdd({
                            id: String(Date.now()),
                            firstName: manualStudent.firstName,
                            lastName: manualStudent.lastName,
                            grade: manualStudent.grade,
                            elopId: manualStudent.elopId,
                            asesId: manualStudent.asesId,
                            guardians: manualStudent.guardians,
                            programs: newPrograms,
                            yearbookPhotoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${manualStudent.firstName}${['William', 'Liam', 'Noah', 'James', 'Lucas', 'Oliver'].includes(manualStudent.firstName) ? '&gender=male' : ''}`,
                            sunriseStatus: 'absent',
                            sunsetStatus: 'absent',
                            hasSnack: false,
                            behavior: 'none',
                            behaviorIssues: [],
                            headInjury: false,
                            headInjuryLogs: []
                        });
                        setManualStudent(EMPTY_STUDENT());
                        setIsAddingGuardian(false);
                        setEditingGuardianIndex(null);
                        showToast('Student successfully added!', 'success');
                    }} style={{ padding: '10px 24px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>Add Student</button>
                </div>
            </div>
        </div>
    );
};

export default RosterManager;
