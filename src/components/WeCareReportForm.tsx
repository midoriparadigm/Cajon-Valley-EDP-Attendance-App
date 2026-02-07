// src/components/WeCareReportForm.tsx
import React, { useState } from 'react';
import type { Student } from '../types';

interface WeCareReportFormProps {
    student: Student;
    currentStaffName: string;
    onSave: (data: { activity: string; info: string; firstAid: string[] }) => void;
    onCancel: () => void;
    darkMode: boolean;
}

const WeCareReportForm = ({ student, currentStaffName, onSave, onCancel, darkMode }: WeCareReportFormProps) => {
    const [activity, setActivity] = useState('');
    const [info, setInfo] = useState('');
    const [firstAid, setFirstAid] = useState<string[]>([]);

    const options = ['Washed/Cleaned', 'Ice', 'Band-Aid', 'Rest', 'Other'];

    const toggleOption = (opt: string) => {
        setFirstAid(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Activity</label>
                <input placeholder="e.g., Soccer, Tag, Snack" value={activity} onChange={e => setActivity(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }} />
            </div>

            <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>First Aid Provided</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {options.map(opt => (
                        <button key={opt} onClick={() => toggleOption(opt)} style={{ padding: '6px 12px', borderRadius: '20px', border: firstAid.includes(opt) ? 'none' : '1px solid var(--border-subtle)', backgroundColor: firstAid.includes(opt) ? '#ec4899' : 'transparent', color: firstAid.includes(opt) ? 'white' : 'var(--text-main)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                            {opt}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Additional Information</label>
                <textarea placeholder="Details about the incident..." value={info} onChange={e => setInfo(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={(e) => { e.stopPropagation(); onSave({ activity, info, firstAid }); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#ec4899', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Save Report</button>
            </div>
        </div>
    );
};

export default WeCareReportForm;
