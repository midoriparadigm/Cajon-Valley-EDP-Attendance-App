// src/components/DailyRecordView.tsx — Searchable, read-only daily record of every attendance/report action
import React, { useEffect, useMemo, useState } from 'react';
import type { Student } from '../types';
import { isSupabaseConfigured } from '../supabaseClient';
import { serializeCsv } from '../utils/csv';
import { formatClockTime, localDateIso } from '../utils/helpers';
import {
    AUDIT_EVENT_LABELS, useAuditEvents, filterDayEvents, fetchRemoteDayEvents, mergeEvents,
    type AuditEvent,
} from '../services/auditLog';

interface DailyRecordViewProps {
    students: Student[];
}

const todayIso = () => localDateIso();

const DailyRecordView = ({ students }: DailyRecordViewProps) => {
    const [date, setDate] = useState(todayIso);
    const [query, setQuery] = useState('');
    const [studentId, setStudentId] = useState<string | null>(null);
    const [remote, setRemote] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(false);

    const sessionEvents = useAuditEvents();
    const selectedStudent = students.find(s => s.id === studentId) ?? null;

    // Database rows only change when someone records something, so they are
    // re-read when the day or student changes, or when this session records a
    // new event. Session events themselves are merged live below.
    useEffect(() => {
        let cancelled = false;
        setLoading(isSupabaseConfigured);
        fetchRemoteDayEvents(date, studentId ?? undefined).then(rows => {
            if (cancelled) return;
            setRemote(rows ?? []);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [date, studentId, sessionEvents.length]);

    const shown = useMemo(
        () => mergeEvents(filterDayEvents(sessionEvents, date, studentId ?? undefined), remote),
        [sessionEvents, remote, date, studentId],
    );

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q || selectedStudent) return [];
        return students
            .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.elopId.includes(q) || (s.asesId ?? '').toLowerCase().includes(q))
            .slice(0, 8);
    }, [query, students, selectedStudent]);

    const savedCount = shown.filter(e => e.persisted).length;
    // Per-row "device only" tags are only useful when a day mixes saved and unsaved entries.
    const isMixed = savedCount > 0 && savedCount < shown.length;
    const badge = shown.length === 0
        ? null
        : savedCount === shown.length
            ? { label: 'Locked', icon: 'lock', fg: '#15803d', bg: 'var(--color-success-bg)' }
            : savedCount === 0
                ? { label: 'Sample data · not saved', icon: 'science', fg: '#92400e', bg: 'var(--color-warning-bg)' }
                : { label: `${shown.length - savedCount} not yet saved`, icon: 'sync_problem', fg: '#92400e', bg: 'var(--color-warning-bg)' };

    const exportCsv = () => {
        const header = ['Date', 'Time', 'Student', 'Program', 'Action', 'Detail', 'Staff', 'Group ID', 'Saved to database'];
        const rows = shown.map(e => [
            date,
            formatClockTime(new Date(e.occurredAt)),
            e.studentName,
            e.program ?? '',
            AUDIT_EVENT_LABELS[e.type],
            e.detail ?? '',
            e.staffName,
            e.batchId ?? '',
            e.persisted ? 'yes' : 'no',
        ]);
        const blob = new Blob([serializeCsv([header, ...rows])], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edp-daily-record-${date}${selectedStudent ? `-${selectedStudent.lastName}` : ''}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const inputStyle: React.CSSProperties = {
        padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '15px', outline: 'none',
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
                Every check-in, check-out and report action, in order. Entries are append-only: an undone check-in
                appears as its own entry rather than erasing the first.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '20px' }}>search</span>
                    {selectedStudent ? (
                        <div style={{ ...inputStyle, paddingLeft: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: '700' }}>{selectedStudent.firstName} {selectedStudent.lastName} · {selectedStudent.grade}</span>
                            <button title="Show all students" onClick={() => { setStudentId(null); setQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                            </button>
                        </div>
                    ) : (
                        <input
                            placeholder="All students — search to narrow"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            style={{ ...inputStyle, width: '100%', paddingLeft: '40px', boxSizing: 'border-box' }}
                        />
                    )}
                    {suggestions.length > 0 && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                            {suggestions.map(s => (
                                <button key={s.id} onClick={() => { setStudentId(s.id); setQuery(''); }} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '14px', textAlign: 'left' }}>
                                    <span style={{ fontWeight: '700' }}>{s.firstName} {s.lastName}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{s.grade} · {s.programs.join(' / ')}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <input type="date" title="Day" value={date} max={todayIso()} onChange={e => e.target.value && setDate(e.target.value)} style={inputStyle} />
                <button onClick={exportCsv} disabled={shown.length === 0} style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: shown.length ? 'pointer' : 'default', opacity: shown.length ? 1 : 0.5 }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>download</span> CSV
                </button>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        Daily record · {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName.charAt(0)}.` : 'All students'} · {new Date(`${date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {badge && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', backgroundColor: badge.bg, color: badge.fg, fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>{badge.icon}</span>{badge.label}
                        </span>
                    )}
                </div>

                {loading && shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
                ) : shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round" style={{ fontSize: '40px', color: 'var(--text-muted)' }}>history</span>
                        <div style={{ fontWeight: '700', marginTop: '8px' }}>Nothing recorded for this day</div>
                    </div>
                ) : (
                    <ol style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
                        {shown.map(e => (
                            <li key={e.id} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: '12px', padding: '8px 16px', fontSize: '14px', alignItems: 'baseline' }}>
                                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    {formatClockTime(new Date(e.occurredAt))}
                                </span>
                                <span style={{ color: 'var(--text-main)', minWidth: 0 }}>
                                    {!selectedStudent && <strong>{e.studentName} · </strong>}
                                    {AUDIT_EVENT_LABELS[e.type]}
                                    {e.program && <span style={{ color: 'var(--text-secondary)' }}> · {e.program === 'sunrise' ? 'Sunrise' : 'Sunset'}</span>}
                                    <span style={{ color: 'var(--text-secondary)' }}> · {e.staffName}</span>
                                    {e.detail && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{e.detail}</div>}
                                    {isMixed && !e.persisted && <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px', fontWeight: '700' }}>Not yet saved — on this device only</div>}
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
};

export default DailyRecordView;
