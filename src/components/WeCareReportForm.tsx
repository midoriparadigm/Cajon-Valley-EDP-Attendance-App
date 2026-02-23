// src/components/WeCareReportForm.tsx
import React, { useState } from 'react';
import type { Student } from '../types';

interface WeCareReportFormProps {
    student: Student;
    currentStaffName: string;
    onSave: (data: { activity: string; info: string; firstAid: string[] }) => void;
    onCancel: () => void;
    darkMode: boolean;
    isEditing?: boolean;              // Whether we are editing an existing report
    initialActivity?: string;         // Pre-fill activity when editing
    initialFirstAid?: string[];       // Pre-fill first aid when editing
    initialInfo?: string;             // Pre-fill additional info when editing
}

const WeCareReportForm = ({ student, currentStaffName, onSave, onCancel, darkMode, isEditing = false, initialActivity = '', initialFirstAid = [], initialInfo = '' }: WeCareReportFormProps) => {
    const activityOptions = ['Soccer', '4-Square', '2-Touch', 'Wall Ball', 'Gaga Ball', 'Tether Ball', 'Playground', 'Swings', 'Other'];

    // Determine if the initial activity is a custom "Other" value
    const isInitialOther = isEditing && initialActivity && !activityOptions.includes(initialActivity);

    const [activity, setActivity] = useState(isInitialOther ? 'Other' : initialActivity);
    const [activityOther, setActivityOther] = useState(isInitialOther ? initialActivity : '');
    const [info, setInfo] = useState(initialInfo);
    const [firstAid, setFirstAid] = useState<string[]>(initialFirstAid);

    const options = ['Washed/Cleaned', 'Ice', 'Band-Aid', 'Rest', 'Other'];

    const toggleOption = (opt: string) => {
        if (isEditing) return; // Locked in edit mode
        setFirstAid(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
    };

    return (
        <div className="responsive-modal-grid">
            {/* LEFT COLUMN: Activity, Additional Info, Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activity</label>
                    <select
                        value={activity}
                        onChange={e => {
                            if (isEditing) return;
                            setActivity(e.target.value);
                            if (e.target.value !== 'Other') {
                                setActivityOther('');
                            }
                        }}
                        disabled={isEditing}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', cursor: isEditing ? 'not-allowed' : 'pointer', opacity: isEditing ? 0.6 : 1, outline: 'none' }}
                    >
                        <option value="">Select an activity...</option>
                        {activityOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>

                {activity === 'Other' && (
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Specify Activity</label>
                        <input
                            placeholder="Enter activity name..."
                            value={activityOther}
                            onChange={e => { if (!isEditing) setActivityOther(e.target.value); }}
                            disabled={isEditing}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: isEditing ? 'var(--bg-app)' : 'var(--bg-card)', color: 'var(--text-main)', opacity: isEditing ? 0.6 : 1, cursor: isEditing ? 'not-allowed' : 'text' }}
                        />
                    </div>
                )}

                <div style={{ backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-subtle)', flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional Information</label>
                    <textarea placeholder="Details about the incident..." value={info} onChange={e => setInfo(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', flex: 1, minHeight: 0, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'inherit', outline: 'none', lineHeight: '1.4', fontSize: '13px', resize: 'none' }} />
                </div>
            </div>

            {/* RIGHT COLUMN: First Aid Provided Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border-subtle)', flex: '1', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '6px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>First Aid Provided</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                            {options.map(opt => {
                                const isSelected = firstAid.includes(opt);
                                return (
                                    <div key={opt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--bg-app)' }}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-main)', flex: 1, paddingRight: '4px', fontWeight: '500' }}>{opt}</span>
                                        <button
                                            disabled={isEditing}
                                            onClick={() => toggleOption(opt)}
                                            style={{
                                                width: '36px', height: '26px', borderRadius: '6px', flexShrink: 0,
                                                border: isSelected ? '2px solid #ec4899' : '1px solid var(--border-subtle)',
                                                backgroundColor: isSelected ? 'rgba(236, 72, 153, 0.15)' : 'var(--bg-card)',
                                                color: isSelected ? '#ec4899' : 'var(--text-secondary)',
                                                fontWeight: '800', fontSize: '14px', cursor: isEditing ? 'not-allowed' : 'pointer',
                                                opacity: isEditing ? 0.5 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >{isSelected ? '✓' : '—'}</button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            {/* Action Buttons at bottom of modal */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ flex: 1, padding: '14px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={(e) => { e.stopPropagation(); onSave({ activity: activity === 'Other' ? activityOther : activity, info, firstAid }); }} style={{ flex: 1, padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: '#ec4899', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>{isEditing ? 'Save Edit' : 'Save Report'}</button>
            </div>
        </div>
    );
};

export default WeCareReportForm;
