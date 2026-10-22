// src/components/GroupCheckInBar.tsx — Bottom action bar shown while selecting a group to check in
import React from 'react';

interface GroupCheckInBarProps {
    selectedCount: number;
    /** Students in the current filtered view that can still be checked in. */
    eligibleVisibleCount: number;
    allVisibleSelected: boolean;
    onToggleSelectAll: () => void;
    onCancel: () => void;
    onConfirm: () => void;
}

const GroupCheckInBar = ({ selectedCount, eligibleVisibleCount, allVisibleSelected, onToggleSelectAll, onCancel, onConfirm }: GroupCheckInBarProps) => {
    const canConfirm = selectedCount > 0;

    return (
        <div
            role="toolbar"
            aria-label="Group check-in"
            style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 950,
                padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
                backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-subtle)',
                boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', animation: 'slideUp 0.2s ease-out',
            }}
        >
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>
                        {selectedCount === 0 ? 'Tap students to add them' : `${selectedCount} selected`}
                    </div>
                    <button
                        onClick={onToggleSelectAll}
                        disabled={eligibleVisibleCount === 0}
                        style={{ background: 'none', border: 'none', padding: 0, marginTop: '2px', color: 'var(--color-primary)', fontSize: '13px', fontWeight: '700', cursor: eligibleVisibleCount === 0 ? 'default' : 'pointer', opacity: eligibleVisibleCount === 0 ? 0.5 : 1 }}
                    >
                        {allVisibleSelected && eligibleVisibleCount > 0 ? 'Clear selection' : `Select all shown (${eligibleVisibleCount})`}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto' }}>
                    <button
                        onClick={onCancel}
                        style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!canConfirm}
                        style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', backgroundColor: canConfirm ? 'var(--color-success)' : 'var(--border-subtle)', color: canConfirm ? 'white' : 'var(--text-muted)', fontWeight: '800', fontSize: '15px', cursor: canConfirm ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '140px', justifyContent: 'center' }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>how_to_reg</span>
                        Check in {selectedCount || ''}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroupCheckInBar;
