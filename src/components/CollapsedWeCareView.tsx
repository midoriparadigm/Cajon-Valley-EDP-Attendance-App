// src/components/CollapsedWeCareView.tsx
import React from 'react';
import type { Student } from '../types';

interface CollapsedWeCareViewProps {
    student: Student;
    onClick: () => void;
    canEdit?: boolean;
    editTimeRemaining?: string;
}

const CollapsedWeCareView = ({ student, onClick, canEdit = true, editTimeRemaining }: CollapsedWeCareViewProps) => {
    const style = {
        bg: '#fce7f3',
        border: '#ec4899',
        text: '#9d174d'
    };

    return (
        <div onClick={canEdit ? onClick : undefined} style={{ backgroundColor: style.bg, borderRadius: '8px', padding: '16px', cursor: canEdit ? 'pointer' : 'default', border: `1px solid ${style.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span className="material-icons-round" style={{ fontSize: '16px', color: style.border }}>medication</span>
                    <span style={{ fontWeight: '800', color: style.text, fontSize: '14px' }}>
                        We Care Report Submitted
                    </span>
                </div>

                {student.weCareActivity && (
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: style.text, opacity: 0.8, marginBottom: '2px', textTransform: 'uppercase' }}>Activity</div>
                        <div style={{ fontSize: '13px', color: style.text, fontWeight: '600' }}>
                            {student.weCareActivity}
                        </div>
                    </div>
                )}

                {student.weCareFirstAid && student.weCareFirstAid.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: style.text, opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase' }}>First Aid Provided</div>
                        {student.weCareFirstAid.map(item => (
                            <div key={item} style={{ fontSize: '13px', fontWeight: '600', color: style.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> {item}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: style.text, opacity: 0.8, marginBottom: '2px', textTransform: 'uppercase' }}>Additional Information</div>
                    <div style={{ fontSize: '13px', color: style.text, fontWeight: '500', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                        {student.weCareInfo || 'No additional information provided.'}
                    </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${style.border}40`, fontSize: '11px', color: style.text, opacity: 0.9 }}>
                    Submitted by <span style={{ fontWeight: '700' }}>{student.weCareStaff || 'Unknown Staff'}</span> on {student.weCareSubmittedAt ? new Date(student.weCareSubmittedAt).toLocaleDateString() : 'Unknown Date'} at {student.weCareSubmittedAt ? new Date(student.weCareSubmittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                </div>

                {editTimeRemaining && canEdit && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: style.text, fontWeight: '700' }}>
                        {editTimeRemaining}
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {canEdit ? (
                    <span className="material-icons-round" style={{ color: style.text }}>edit</span>
                ) : (
                    <span className="material-icons-round" style={{ color: style.text, opacity: 0.3 }}>edit_off</span>
                )}
            </div>
        </div>
    );
};

export default CollapsedWeCareView;
