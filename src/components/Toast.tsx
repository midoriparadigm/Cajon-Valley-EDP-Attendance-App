// src/components/Toast.tsx
import React from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastProps {
    message: string;
    type: ToastType;
    /** Distance from the bottom edge — raised while a bottom action bar is showing. */
    bottomOffset?: number;
    /** A button in the toast, e.g. "Open letter". */
    action?: ToastAction;
    /** Shows a close button (used with an action, since those toasts stay up longer). */
    onDismiss?: () => void;
}

const Toast = ({ message, type, bottomOffset = 40, action, onDismiss }: ToastProps) => {
    let bgColor = 'var(--text-secondary)';
    let icon = 'info';
    if (type === 'success') { bgColor = 'var(--color-success)'; icon = 'check_circle'; }
    else if (type === 'warning') { bgColor = '#b45309'; icon = 'warning'; }
    else if (type === 'error') { bgColor = 'var(--color-danger)'; icon = 'error'; }

    return (
        <div role={type === 'error' ? 'alert' : 'status'} style={{
            // Explicit width: index.css sets `#root > * { width: 100% }`, which
            // otherwise stretches this centered pill across the whole screen.
            position: 'fixed', bottom: `${bottomOffset}px`, left: '50%', transform: 'translateX(-50%)',
            width: 'max-content', maxWidth: 'calc(100% - 32px)',
            backgroundColor: bgColor, color: 'white', padding: action ? '10px 10px 10px 18px' : '12px 24px', borderRadius: action ? '16px' : '30px',
            boxShadow: 'var(--shadow-lg)', fontWeight: '600', fontSize: '14px',
            // Above the student page (1000) and the Leader Dashboard (2000), which
            // open in portals; below the print preview (9999).
            zIndex: 5000,
            display: 'flex', alignItems: 'center', gap: '8px', animation: 'slideUp 0.3s ease-out'
        }}>
            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px', flexShrink: 0 }}>{icon}</span>
            <span style={{ lineHeight: 1.35 }}>{message}</span>
            {action && (
                <button type="button" onClick={action.onClick} style={{ flexShrink: 0, marginLeft: '4px', padding: '8px 12px', borderRadius: '10px', border: 'none', backgroundColor: 'white', color: '#1f2937', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {action.label}
                </button>
            )}
            {onDismiss && (
                <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ flexShrink: 0, display: 'flex', padding: '4px', border: 'none', background: 'none', color: 'white', cursor: 'pointer', opacity: 0.85 }}>
                    <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>close</span>
                </button>
            )}
        </div>
    );
};

export default Toast;
