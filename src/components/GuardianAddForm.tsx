// src/components/GuardianAddForm.tsx
import React, { useState, useEffect } from 'react';
import type { GuardianContact } from '../types';

interface GuardianAddFormProps {
    onSave: (g: GuardianContact) => void;
    onCancel: () => void;
    onDelete?: () => void;
    initialContact?: GuardianContact;
    unavailableTypes?: string[];
    darkMode: boolean;
}

const GuardianAddForm = ({ onSave, onCancel, onDelete, initialContact, unavailableTypes = [], darkMode }: GuardianAddFormProps) => {
    const [type, setType] = useState<'Contact 1' | 'Contact 2' | 'Contact 3' | 'Contact 4' | 'Contact 5'>((initialContact?.type as any) || 'Contact 2');
    const [first, setFirst] = useState(initialContact?.firstName || '');
    const [last, setLast] = useState(initialContact?.lastName || '');
    const [phone, setPhone] = useState(initialContact?.phone || '');
    const [email, setEmail] = useState(initialContact?.email || '');
    const [notifySms, setNotifySms] = useState(initialContact?.notifySms || false);
    const [notifyEmail, setNotifyEmail] = useState(initialContact?.notifyEmail || false);

    // Available types: The current type (if editing) OR types not in unavailableTypes
    const availableTypes = ['Contact 1', 'Contact 2', 'Contact 3', 'Contact 4', 'Contact 5'].filter(t => t === initialContact?.type || !unavailableTypes.includes(t));

    useEffect(() => {
        if (!initialContact && availableTypes.length > 0 && !availableTypes.includes(type)) {
            setType(availableTypes[0] as any);
        }
    }, [availableTypes, type, initialContact]);

    const handleSubmit = () => {
        if (!first || !last || !phone) return;
        onSave({ type, firstName: first, lastName: last, phone, email, notifySms, notifyEmail });
    };

    return (
        <div style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-main)', fontWeight: '700' }}>{initialContact ? 'Edit Guardian' : 'New Guardian'}</h4>
                <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '13px', fontWeight: '600' }}
                >
                    {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                <input placeholder="First Name" value={first} onChange={e => setFirst(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px' }} />
                <input placeholder="Last Name" value={last} onChange={e => setLast(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px' }} />
            </div>
            <input placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', width: '100%' }} />
            <input placeholder="Email Address (Optional)" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', width: '100%' }} />

            {/* Notifications Toggles */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-subtle)', opacity: phone ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>sms</span>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>SMS Alerts</span>
                    </div>
                    <button
                        onClick={() => phone && setNotifySms(!notifySms)}
                        disabled={!phone}
                        style={{ width: '40px', height: '24px', borderRadius: '12px', backgroundColor: notifySms ? 'var(--color-toggle-active)' : '#d1d5db', position: 'relative', border: 'none', cursor: phone ? 'pointer' : 'not-allowed', transition: 'all 0.2s', padding: 0, flexShrink: 0 }}
                    >
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: notifySms ? '18px' : '2px', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                    </button>
                </div>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-subtle)', opacity: email ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>email</span>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>Email Alerts</span>
                    </div>
                    <button
                        onClick={() => email && setNotifyEmail(!notifyEmail)}
                        disabled={!email}
                        style={{ width: '40px', height: '24px', borderRadius: '12px', backgroundColor: notifyEmail ? 'var(--color-toggle-active)' : '#d1d5db', position: 'relative', border: 'none', cursor: email ? 'pointer' : 'not-allowed', transition: 'all 0.2s', padding: 0, flexShrink: 0 }}
                    >
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: notifyEmail ? '18px' : '2px', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                    </button>
                </div>
            </div>

            {type !== 'Contact 1' && (
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <span className="material-icons-round" style={{ color: 'var(--color-info)', fontSize: '20px' }}>info</span>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        <strong>Authorization Required:</strong> Adding a contact (2-5) requires explicit approval from <strong>the Primary Contact</strong>. Adding this contact will trigger an authorization request SMS.
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                {initialContact && onDelete && (
                    <button onClick={onDelete} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-danger)', backgroundColor: 'var(--bg-card)', color: 'var(--color-danger)', cursor: 'pointer', fontWeight: '600' }}>Delete</button>
                )}
                <button onClick={handleSubmit} style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: darkMode ? '#3b82f6' : 'var(--color-success)', color: 'white', cursor: 'pointer', fontWeight: '700' }}>{initialContact ? 'Save Changes' : 'Add Guardian'}</button>
            </div>
        </div>
    );
};

export default GuardianAddForm;
