// src/components/DailyRecordView.tsx — Searchable, read-only daily record of every attendance/report action
import React, { useEffect, useMemo, useState } from 'react';
import type { Student } from '../types';
import { isSupabaseConfigured } from '../supabaseClient';
import { serializeCsv } from '../utils/csv';
import { formatClockTime, localDateIso } from '../utils/helpers';
import {
    AUDIT_EVENT_LABELS, useAuditEvents, filterDayEvents, fetchRemoteDayEvents, mergeEvents,
    type RemoteDayResult,
} from '../services/auditLog';

interface DailyRecordViewProps {
    students: Student[];
}

const todayIso = () => localDateIso();

const DailyRecordView = ({ students }: DailyRecordViewProps) => {
    const [date, setDate] = useState(todayIso);
    const [query, setQuery] = useState('');
    const [studentId, setStudentId] = useState<string | null>(null);
    // Each database result remembers the query it answers. While a new
    // student/day loads, the previous answer is not shown or exported under
    // the new selection.
    const [remote, setRemote] = useState<{ key: string; result: RemoteDayResult } | null>(null);

    const sessionEvents = useAuditEvents();
    const selectedStudent = students.find(s => s.id === studentId) ?? null;
    const queryKey = `${date}|${studentId ?? '*'}`;

    // Re-read when the day or student changes, or when this session records a
    // new event. Session events themselves are merged live below.
    useEffect(() => {
        let cancelled = false;
        const key = queryKey;
        fetchRemoteDayEvents(date, studentId ?? undefined).then(result => {
            if (!cancelled) setRemote({ key, result });
        });
        return () => { cancelled = true; };
    }, [date, studentId, sessionEvents.length]);

    const current = remote && remote.key === queryKey ? remote.result : null;
    const isLoading = current === null;
    const readError = current?.status === 'error' ? current.message : null;
    const truncated = current?.status === 'ok' && current.truncated;

    const shown = useMemo(
        // Filter the merged list, not just the session part, so no row from another day or student can slip in.
        () => filterDayEvents(mergeEvents(sessionEvents, current?.status === 'ok' ? current.rows : []), date, studentId ?? undefined),
        [sessionEvents, current, date, studentId],
    );

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q || selectedStudent) return [];
        return students
            .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.elopId.includes(q) || (s.asesId ?? '').toLowerCase().includes(q))
            .slice(0, 8);
    }, [query, students, selectedStudent]);

    const savedCount = shown.filter(e => e.persisted).length;
    const failedCount = shown.filter(e => !e.persisted && !e.localOnly).length;
    const localCount = shown.filter(e => e.localOnly).length;
    const isMixed = localCount > 0 && localCount < shown.length;

    const badge = shown.length === 0
        ? null
        : failedCount > 0
            ? { label: `${failedCount} failed to save`, icon: 'sync_problem', fg: '#b91c1c', bg: 'var(--color-danger-bg)' }
            : savedCount === shown.length
                ? { label: 'Locked', icon: 'lock', fg: '#15803d', bg: 'var(--color-success-bg)' }
                : localCount === shown.length
                    ? { label: 'Sample data · not saved', icon: 'science', fg: '#92400e', bg: 'var(--color-warning-bg)' }
                    : { label: `${localCount} not saved · session-only students`, icon: 'science', fg: '#92400e', bg: 'var(--color-warning-bg)' };

    // Exporting while the database part is loading or failed would produce an
    // incomplete file that looks complete.
    const canExport = shown.length > 0 && !(isSupabaseConfigured && (isLoading || readError));

    const exportCsv = () => {
        const header = ['Date', 'Time', 'Student', 'Program', 'Action', 'Detail', 'Staff', 'Group ID', 'Saved to database'];
        const rows = shown.map(e => {
            const at = new Date(e.occurredAt);
            return [
                localDateIso(at),
                formatClockTime(at),
                e.studentName,
                e.program ?? '',
                AUDIT_EVENT_LABELS[e.type],
                e.detail ?? '',
                e.staffName,
                e.batchId ?? '',
                e.persisted ? 'yes' : e.localOnly ? 'no (session only)' : 'no (failed)',
            ];
        });
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
                <button onClick={exportCsv} disabled={!canExport} title={canExport ? 'Download this record as CSV' : 'Available once the full record has loaded'} style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: canExport ? 'pointer' : 'default', opacity: canExport ? 1 : 0.5 }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>download</span> CSV
                </button>
            </div>

            {readError && (
                <div role="alert" style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: 'var(--color-danger-bg)', color: '#b91c1c', fontSize: '14px', fontWeight: '600' }}>
                    Couldn't load saved records from the database. Showing only entries made on this device — this is not the full record.
                </div>
            )}
            {truncated && (
                <div role="status" style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: 'var(--color-warning-bg)', color: '#92400e', fontSize: '14px', fontWeight: '600' }}>
                    This day has more entries than can be shown at once. Narrow to one student to see their full record.
                </div>
            )}

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        Daily record · {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName.charAt(0)}.` : 'All students'} · {new Date(`${date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {badge && !(isSupabaseConfigured && isLoading) && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', backgroundColor: badge.bg, color: badge.fg, fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>{badge.icon}</span>{badge.label}
                        </span>
                    )}
                </div>

                {isSupabaseConfigured && isLoading && shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
                ) : shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round" style={{ fontSize: '40px', color: 'var(--text-muted)' }}>history</span>
                        <div style={{ fontWeight: '700', marginTop: '8px' }}>{readError ? 'No entries on this device' : 'Nothing recorded for this day'}</div>
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
                                    {!e.persisted && !e.localOnly && <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px', fontWeight: '700' }}>Failed to save — on this device only</div>}
                                    {isMixed && e.localOnly && <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px', fontWeight: '700' }}>Not saved — session-only student</div>}
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
