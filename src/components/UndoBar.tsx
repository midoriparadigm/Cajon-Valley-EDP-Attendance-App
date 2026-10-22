// src/components/UndoBar.tsx — Short-lived "Checked in · Undo" bar after a quick or group check-in
import React from 'react';
import { UNDO_WINDOW_MS } from '../constants';

interface UndoBarProps {
    message: string;
    onUndo: () => void;
}

const UndoBar = ({ message, onUndo }: UndoBarProps) => (
    <div
        role="status"
        aria-live="polite"
        style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)',
            bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 960,
            width: 'min(480px, calc(100% - 32px))', overflow: 'hidden',
            backgroundColor: 'var(--text-main)', color: 'var(--bg-card)',
            borderRadius: '14px', boxShadow: 'var(--shadow-lg)',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 12px 12px 16px' }}>
            <span className="material-icons-round" style={{ color: 'var(--color-success)', fontSize: '22px' }}>check_circle</span>
            <span style={{ flex: 1, fontSize: '14px', fontWeight: '700', minWidth: 0 }}>{message}</span>
            <button
                onClick={onUndo}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid currentColor', backgroundColor: 'transparent', color: 'inherit', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}
            >
                Undo
            </button>
        </div>
        {/* Drains over the undo window so staff can see how long they have. */}
        <div style={{ height: '3px', backgroundColor: 'var(--color-success)', transformOrigin: 'left', animation: `undoDrain ${UNDO_WINDOW_MS}ms linear forwards` }} />
        <style>{'@keyframes undoDrain { from { transform: scaleX(1); } to { transform: scaleX(0); } }'}</style>
    </div>
);

export default UndoBar;
