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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>ACTIVITY</label>
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
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: isEditing ? 'var(--bg-app)' : 'var(--bg-card)', color: 'var(--text-main)', fontSize: '14px', cursor: isEditing ? 'not-allowed' : 'pointer', opacity: isEditing ? 0.6 : 1 }}
                >
                    <option value="">Select an activity...</option>
                    {activityOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            </div>

            {activity === 'Other' && (
                <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>SPECIFY ACTIVITY</label>
                    <input
                        placeholder="Enter activity name..."
                        value={activityOther}
                        onChange={e => { if (!isEditing) setActivityOther(e.target.value); }}
                        disabled={isEditing}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: isEditing ? 'var(--bg-app)' : 'var(--bg-card)', color: 'var(--text-main)', opacity: isEditing ? 0.6 : 1, cursor: isEditing ? 'not-allowed' : 'text' }}
                    />
                </div>
            )}

            <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>FIRST AID PROVIDED</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {options.map(opt => (
                        <button key={opt} onClick={() => toggleOption(opt)} disabled={isEditing} style={{ padding: '6px 12px', borderRadius: '20px', border: firstAid.includes(opt) ? 'none' : '1px solid var(--border-subtle)', backgroundColor: firstAid.includes(opt) ? (isEditing ? '#f9a8d4' : '#ec4899') : 'transparent', color: firstAid.includes(opt) ? 'white' : 'var(--text-main)', fontSize: '12px', fontWeight: '600', cursor: isEditing ? 'not-allowed' : 'pointer', opacity: isEditing ? 0.6 : 1 }}>
                            {opt}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>ADDITIONAL INFORMATION</label>
                <textarea placeholder="Details about the incident..." value={info} onChange={e => setInfo(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={(e) => { e.stopPropagation(); onSave({ activity: activity === 'Other' ? activityOther : activity, info, firstAid }); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#ec4899', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>{isEditing ? 'Save Edit' : 'Save Report'}</button>
            </div>
        </div>
    );
};

export default WeCareReportForm;
