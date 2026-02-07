// src/components/CollapsedBehaviorView.tsx
import React from 'react';
import type { Student } from '../types';

interface CollapsedBehaviorViewProps {
    student: Student;
    onClick: () => void;
}

const CollapsedBehaviorView = ({ student, onClick }: CollapsedBehaviorViewProps) => {
    const colors = {
        green: { bg: 'var(--color-success-bg)', border: 'var(--color-success)', text: '#065f46', level: '1' },
        yellow: { bg: 'var(--color-warning-bg)', border: 'var(--color-warning)', text: '#854d0e', level: '2' },
        red: { bg: 'var(--color-danger-bg)', border: 'var(--color-danger)', text: '#b91c1c', level: '3' },
        none: { bg: 'var(--bg-app)', border: 'var(--border-subtle)', text: 'var(--text-main)', level: '0' }
    };
    const style = colors[student.behavior] || colors.none;

    return (
        <div onClick={onClick} style={{ backgroundColor: style.bg, borderRadius: '8px', padding: '16px', cursor: 'pointer', border: `1px solid ${style.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
            </div>
            <span className="material-icons-round" style={{ color: style.text }}>edit</span>
        </div>
    );
};

export default CollapsedBehaviorView;
