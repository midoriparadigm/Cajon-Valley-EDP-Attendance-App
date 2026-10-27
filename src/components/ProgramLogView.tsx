// src/components/ProgramLogView.tsx — Read-only, program-wide log of one day's attendance and report actions
//
// One student's day lives on their student page (the summary card); this is
// the whole program at once, with totals for the day.
import React, { useMemo, useState } from 'react';
import type { Student } from '../types';
import { GRADES } from '../constants';
import { isSupabaseConfigured } from '../supabaseClient';
import { serializeCsv } from '../utils/csv';
import { formatClockTime, localDateIso } from '../utils/helpers';
import { dayTotals } from '../utils/recordSummary';
import { AUDIT_EVENT_LABELS, type AuditEventType } from '../services/auditLog';
import { useDayEvents } from '../services/useDayEvents';

interface ProgramLogViewProps {
    students: Student[];
}

type LogFilter = 'all' | 'attendance' | 'reports' | 'letters';

const FILTERS: { id: LogFilter; label: string; types?: AuditEventType[] }[] = [
    { id: 'all', label: 'All' },
    { id: 'attendance', label: 'Attendance', types: ['check_in', 'check_in_undone', 'checkout_requested', 'checked_out'] },
    { id: 'reports', label: 'Reports', types: ['behavior_submitted', 'we_care_submitted', 'head_injury_started', 'head_injury_check'] },
    { id: 'letters', label: 'Parent letters', types: ['parent_report_sent'] },
];

const ProgramLogView = ({ students }: ProgramLogViewProps) => {
    const today = localDateIso();
    const [date, setDate] = useState(today);
    const [filter, setFilter] = useState<LogFilter>('all');
    const [grade, setGrade] = useState('all');
    const [openLetterId, setOpenLetterId] = useState<string | null>(null);

    const day = useDayEvents(date, undefined, students);
    const gradeOf = useMemo(() => new Map(students.map(s => [s.id, s.grade])), [students]);

    // The grade narrows the totals too; the type filter only narrows the list.
    const inGrade = useMemo(
        () => (grade === 'all' ? day.events : day.events.filter(e => gradeOf.get(e.studentId) === grade)),
        [day.events, grade, gradeOf],
    );
    const totals = useMemo(() => dayTotals(inGrade), [inGrade]);
    const types = FILTERS.find(f => f.id === filter)?.types;
    const shown = types ? inGrade.filter(e => types.includes(e.type)) : inGrade;

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
    const canExport = shown.length > 0 && !(isSupabaseConfigured && (day.loading || day.error));

    const exportCsv = () => {
        const header = ['Date', 'Time', 'Student', 'Grade', 'Program', 'Action', 'Detail', 'Staff', 'Group ID', 'Letter text', 'Saved to database'];
        const rows = shown.map(e => {
            const at = new Date(e.occurredAt);
            return [
                localDateIso(at),
                formatClockTime(at),
                e.studentName,
                gradeOf.get(e.studentId) ?? '',
                e.program ?? '',
                AUDIT_EVENT_LABELS[e.type],
                e.detail ?? '',
                e.staffName,
                e.batchId ?? '',
                e.body ?? '',
                e.persisted ? 'yes' : e.localOnly ? 'no (session only)' : 'no (failed)',
            ];
        });
        const blob = new Blob([serializeCsv([header, ...rows])], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edp-program-log-${date}${grade !== 'all' ? `-grade-${grade}` : ''}${filter !== 'all' ? `-${filter}` : ''}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const inputStyle: React.CSSProperties = {
        padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '15px', outline: 'none', fontFamily: 'inherit',
    };

    const stats = [
        { label: 'Checked in', value: totals.checkedIn },
        { label: 'Checked out', value: totals.checkedOut },
        { label: date === today ? 'Still here' : 'No check-out', value: totals.notCheckedOut },
        { label: 'Incidents', value: totals.incidents },
        { label: 'Letters sent', value: totals.lettersSent },
    ];
    const statsPending = isSupabaseConfigured && day.loading;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
                Every check-in, check-out, report and parent letter across the program, in order. Entries are
                append-only: an undone check-in appears as its own entry rather than erasing the first. For one
                student's day, open their student page.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input type="date" title="Day" aria-label="Day" value={date} max={today} onChange={e => { if (e.target.value) { setDate(e.target.value); setOpenLetterId(null); } }} style={inputStyle} />
                <select title="Grade" aria-label="Grade" value={grade} onChange={e => setGrade(e.target.value)} style={inputStyle}>
                    <option value="all">All grades</option>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
                <button onClick={exportCsv} disabled={!canExport} title={canExport ? 'Download what is shown as CSV' : 'Available once the full record has loaded'} style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: canExport ? 'pointer' : 'default', opacity: canExport ? 1 : 0.5, marginLeft: 'auto' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>download</span> CSV
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '8px' }}>
                {stats.map(s => (
                    <div key={s.label} style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)' }}>{statsPending ? '…' : s.value}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {day.error && (
                <div role="alert" style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: 'var(--color-danger-bg)', color: '#b91c1c', fontSize: '14px', fontWeight: '600' }}>
                    Couldn't load saved records from the database. Showing only entries made on this device — this is not the full record.
                </div>
            )}
            {day.truncated && (
                <div role="status" style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: 'var(--color-warning-bg)', color: '#92400e', fontSize: '14px', fontWeight: '600' }}>
                    This day has more entries than can be loaded at once, so the list, totals and export are incomplete.
                </div>
            )}

            <div role="group" aria-label="Show" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} style={{ padding: '8px 14px', borderRadius: '999px', border: filter === f.id ? '1px solid var(--text-main)' : '1px solid var(--border-subtle)', backgroundColor: filter === f.id ? 'var(--text-main)' : 'var(--bg-card)', color: filter === f.id ? 'var(--bg-card)' : 'var(--text-main)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        {f.label}
                    </button>
                ))}
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        Program log · {grade === 'all' ? 'All grades' : `Grade ${grade}`} · {new Date(`${date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {badge && !statsPending && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', backgroundColor: badge.bg, color: badge.fg, fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>{badge.icon}</span>{badge.label}
                        </span>
                    )}
                </div>

                {statsPending && shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
                ) : shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round" style={{ fontSize: '40px', color: 'var(--text-muted)' }}>history</span>
                        <div style={{ fontWeight: '700', marginTop: '8px' }}>
                            {day.error ? 'No entries on this device' : inGrade.length > 0 ? 'No entries of this kind' : 'Nothing recorded for this day'}
                        </div>
                    </div>
                ) : (
                    <ol style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
                        {shown.map(e => {
                            const letterOpen = openLetterId === e.id;
                            return (
                                <li key={e.id} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: '12px', padding: '8px 16px', fontSize: '14px', alignItems: 'baseline' }}>
                                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {formatClockTime(new Date(e.occurredAt))}
                                    </span>
                                    <span style={{ color: 'var(--text-main)', minWidth: 0 }}>
                                        <strong>{e.studentName}{gradeOf.has(e.studentId) ? ` (${gradeOf.get(e.studentId)})` : ''} · </strong>
                                        {AUDIT_EVENT_LABELS[e.type]}
                                        {e.program && <span style={{ color: 'var(--text-secondary)' }}> · {e.program === 'sunrise' ? 'Sunrise' : 'Sunset'}</span>}
                                        <span style={{ color: 'var(--text-secondary)' }}> · {e.staffName}</span>
                                        {e.detail && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{e.detail}</div>}
                                        {e.body && (
                                            <button onClick={() => setOpenLetterId(letterOpen ? null : e.id)} aria-expanded={letterOpen} style={{ marginTop: '4px', padding: 0, border: 'none', background: 'none', color: '#b45309', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>{letterOpen ? 'expand_less' : 'expand_more'}</span>
                                                {letterOpen ? 'Hide letter' : 'Read letter'}
                                            </button>
                                        )}
                                        {letterOpen && e.body && (
                                            <div style={{ marginTop: '6px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                                {e.body}
                                            </div>
                                        )}
                                        {!e.persisted && !e.localOnly && <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px', fontWeight: '700' }}>Failed to save — on this device only</div>}
                                        {isMixed && e.localOnly && <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px', fontWeight: '700' }}>Not saved — session-only student</div>}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </div>
    );
};

export default ProgramLogView;
