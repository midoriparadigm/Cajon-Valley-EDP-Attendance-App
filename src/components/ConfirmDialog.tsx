// src/components/ConfirmDialog.tsx — "Are you sure?" pop-out (group check-in, a Lead undoing a check-in)
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
    title: string;
    children: React.ReactNode;
    confirmLabel: string;
    /** Confirm button colour, e.g. var(--color-success) or var(--color-danger). */
    confirmColor: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * A tap this soon after the dialog opens is the end of the tap that opened it
 * (a double-tap), not a decision, so it neither confirms nor dismisses.
 */
export const DOUBLE_TAP_GUARD_MS = 400;

const ConfirmDialog = ({ title, children, confirmLabel, confirmColor, onConfirm, onCancel }: ConfirmDialogProps) => {
    const titleId = useId();
    const openedAt = useRef(Date.now());
    const settled = () => Date.now() - openedAt.current >= DOUBLE_TAP_GUARD_MS;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);

    return createPortal(
        <div onClick={() => { if (settled()) onCancel(); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h3 id={titleId} style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>{title}</h3>
                {children}
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button autoFocus onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => { if (settled()) onConfirm(); }} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: confirmColor, color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>{confirmLabel}</button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default ConfirmDialog;
