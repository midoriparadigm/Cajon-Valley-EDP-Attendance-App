// src/components/RosterManager.tsx
import React, { useState, useRef } from 'react';
import type { Student, GuardianContact, SubProgram } from '../types';
import { GRADES } from '../constants';

interface RosterManagerProps {
    onImport: (s: Student[]) => void;
    onAdd: (s: Student) => void;
    showToast: (msg: string, type: any) => void;
}

const RosterManager = ({ onImport, onAdd, showToast }: RosterManagerProps) => {
    const [manualStudent, setManualStudent] = useState<{
        firstName: string;
        lastName: string;
        grade: string;
        elopId: string;
        asesId: string;
        guardians: GuardianContact[];
    }>({
        firstName: '',
        lastName: '',
        grade: 'Grade',
        elopId: '',
        asesId: '',
        guardians: [
            { type: 'Primary', firstName: '', lastName: '', phone: '', email: '', relationship: 'Parent' },
            { type: 'Secondary', firstName: '', lastName: '', phone: '', email: '', relationship: '' },
            { type: 'Additional', firstName: '', lastName: '', phone: '', email: '', relationship: '' }
        ]
    });
    const [activeGuardianTab, setActiveGuardianTab] = useState<number>(0);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const newStudents: Student[] = [
                { id: 'new1', elopId: '9001', firstName: 'New', lastName: 'Student', grade: '1', guardians: [{ type: 'Contact 1', firstName: 'Guardian', lastName: 'Name', phone: '', email: '' }], programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [] }
            ];
            onImport(newStudents);
            alert('Roster Imported Successfully');
        }
    };

    const handleGuardianChange = (field: keyof GuardianContact, value: string) => {
        const newGuardians = [...manualStudent.guardians];
        newGuardians[activeGuardianTab] = { ...newGuardians[activeGuardianTab], [field]: value };
        setManualStudent({ ...manualStudent, guardians: newGuardians });
    };

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

                {/* Student Check-in Info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                    <input placeholder="First Name" value={manualStudent.firstName} onChange={e => setManualStudent({ ...manualStudent, firstName: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                    <input placeholder="Last Name" value={manualStudent.lastName} onChange={e => setManualStudent({ ...manualStudent, lastName: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                    <input
                        placeholder="ELOP ID"
                        value={manualStudent.elopId}
                        onChange={e => setManualStudent({ ...manualStudent, elopId: e.target.value })}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                    <input
                        placeholder="ASES ID"
                        value={manualStudent.asesId}
                        onChange={e => setManualStudent({ ...manualStudent, asesId: e.target.value })}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                    />
                    <select title="Select Grade" value={manualStudent.grade} onChange={e => setManualStudent({ ...manualStudent, grade: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}>
                        <option value="Grade">Grade</option>
                        {GRADES.filter(g => g !== 'All').map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>

                {/* Guardian Tabs */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>Guardian Information</label>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                        {['Contact 1', 'Contact 2', 'Contact 3', 'Contact 4', 'Contact 5'].map((t, i) => (
                            <button
                                key={t}
                                onClick={() => setActiveGuardianTab(i)}
                                style={{
                                    padding: '6px 12px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: activeGuardianTab === i ? '2px solid var(--color-primary)' : '2px solid transparent',
                                    color: activeGuardianTab === i ? 'var(--color-primary)' : 'var(--text-secondary)',
                                    fontWeight: activeGuardianTab === i ? '700' : '500',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <input placeholder="First Name" value={manualStudent.guardians[activeGuardianTab]?.firstName || ''} onChange={(e) => handleGuardianChange('firstName', e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                            <input placeholder="Last Name" value={manualStudent.guardians[activeGuardianTab]?.lastName || ''} onChange={(e) => handleGuardianChange('lastName', e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <input placeholder="Phone" value={manualStudent.guardians[activeGuardianTab]?.phone || ''} onChange={(e) => handleGuardianChange('phone', e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                            <input placeholder="Email" value={manualStudent.guardians[activeGuardianTab]?.email || ''} onChange={(e) => handleGuardianChange('email', e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                        </div>
                        <input placeholder="Relationship (e.g. Parent, Aunt)" value={manualStudent.guardians[activeGuardianTab]?.relationship || ''} onChange={(e) => handleGuardianChange('relationship', e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }} />
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <button onClick={() => {
                        if (!manualStudent.firstName || !manualStudent.lastName || manualStudent.grade === 'Grade') {
                            showToast('Please fill Name and Grade', 'error');
                            return;
                        }
                        if (!manualStudent.guardians[0]?.firstName) {
                            showToast('Primary Guardian is required', 'error');
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
                            guardians: manualStudent.guardians.filter(g => g.firstName.trim() !== ''),
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
                        setManualStudent({
                            firstName: '', lastName: '', grade: 'Grade', elopId: '', asesId: '',
                            guardians: [
                                { type: 'Contact 1', firstName: '', lastName: '', phone: '', email: '', relationship: 'Parent' },
                                { type: 'Contact 2', firstName: '', lastName: '', phone: '', email: '', relationship: '' },
                                { type: 'Contact 3', firstName: '', lastName: '', phone: '', email: '', relationship: '' }
                            ]
                        });
                        setActiveGuardianTab(0);
                        showToast('Student successfully added!', 'success');
                    }} style={{ padding: '10px 24px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>Add Student</button>
                </div>
            </div>
        </div>
    );
};

export default RosterManager;
