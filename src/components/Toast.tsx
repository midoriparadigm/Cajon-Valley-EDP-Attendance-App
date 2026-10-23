// src/components/Toast.tsx
import React from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ToastProps {
    message: string;
    type: ToastType;
    /** Distance from the bottom edge — raised while a bottom action bar is showing. */
    bottomOffset?: number;
}

const Toast = ({ message, type, bottomOffset = 40 }: ToastProps) => {
    let bgColor = 'var(--text-secondary)';
    let icon = 'info';
    if (type === 'success') { bgColor = 'var(--color-success)'; icon = 'check_circle'; }
    else if (type === 'warning') { bgColor = 'var(--color-warning)'; icon = 'warning'; }
    else if (type === 'error') { bgColor = 'var(--color-danger)'; icon = 'error'; }

    return (
        <div style={{
            // Explicit width: index.css sets `#root > * { width: 100% }`, which
            // otherwise stretches this centered pill across the whole screen.
            position: 'fixed', bottom: `${bottomOffset}px`, left: '50%', transform: 'translateX(-50%)',
            width: 'max-content', maxWidth: 'calc(100% - 32px)',
            backgroundColor: bgColor, color: 'white', padding: '12px 24px', borderRadius: '30px',
            boxShadow: 'var(--shadow-lg)', fontWeight: '600', fontSize: '14px', zIndex: 350,
            display: 'flex', alignItems: 'center', gap: '8px', animation: 'slideUp 0.3s ease-out'
        }}>
            <span className="material-icons-round" style={{ fontSize: '18px' }}>{icon}</span>
            {message}
        </div>
    );
};

export default Toast;
