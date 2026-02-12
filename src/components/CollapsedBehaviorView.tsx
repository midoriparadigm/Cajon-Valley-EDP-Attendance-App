// src/components/CollapsedBehaviorView.tsx
import React from 'react';
import type { Student } from '../types';

interface CollapsedBehaviorViewProps {
    student: Student;
    onClick: () => void;
    canEdit?: boolean;              // Whether editing is allowed
    editTimeRemaining?: string;     // e.g., "8 min left to edit"
}

const CollapsedBehaviorView = ({ student, onClick, canEdit = true, editTimeRemaining }: CollapsedBehaviorViewProps) => {
    const colors = {
        green: { bg: 'var(--color-success-bg)', border: 'var(--color-success)', text: '#065f46', level: '1' },
        yellow: { bg: 'var(--color-warning-bg)', border: 'var(--color-warning)', text: '#854d0e', level: '2' },
        red: { bg: 'var(--color-danger-bg)', border: 'var(--color-danger)', text: '#b91c1c', level: '3' },
        none: { bg: 'var(--bg-app)', border: 'var(--border-subtle)', text: 'var(--text-main)', level: '0' }
    };
    const style = colors[student.behavior] || colors.none;

    return (
        <div onClick={canEdit ? onClick : undefined} style={{ backgroundColor: style.bg, borderRadius: '8px', padding: '16px', cursor: canEdit ? 'pointer' : 'default', border: `1px solid ${style.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: style.border }}></div>
                    <span style={{ fontWeight: '800', color: style.text, fontSize: '14px' }}>
                        LEVEL {style.level} FILED
                    </span>
                </div>

                {student.behaviorIssues.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                        {student.behaviorIssues.map(issue => (
                            <div key={issue} style={{ fontSize: '13px', fontWeight: '700', color: style.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> {issue}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ fontSize: '13px', color: style.text, fontWeight: '500', lineHeight: '1.4' }}>
                    {student.behaviorDescription || 'No additional description provided.'}
                </div>

                {editTimeRemaining && canEdit && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: style.text, fontWeight: '600', opacity: 0.8 }}>
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

export default CollapsedBehaviorView;
