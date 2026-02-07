// src/components/CollapsedHeadInjuryView.tsx
import React from 'react';
import { formatTimeWithMs } from '../utils/helpers';

interface CollapsedHeadInjuryViewProps {
    timeLeft: number;
}

const CollapsedHeadInjuryView = ({ timeLeft }: CollapsedHeadInjuryViewProps) => (
    <div style={{ backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center', border: '1px solid var(--border-subtle)', opacity: 0.8 }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Active Monitoring</div>
        <div style={{ fontSize: '28px', fontWeight: '800', color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
            {formatTimeWithMs(timeLeft)}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Next assessment unlocks automatically</div>
    </div>
);

export default CollapsedHeadInjuryView;
