// src/components/StudentSummary.tsx — Summary card at the top of the student page
//
// Today: one line per thing that happened (attendance, reports, letters),
// each with the same icon badge as its tile; tapping a line opens that tile.
// The Lead can pick an earlier day, rebuilt from the event log, including the
// text of parent letters that were sent.
import React, { useMemo, useState } from 'react';
import type { Student, ParentReport, ProgramType } from '../types';
import {
    KIND_STYLES, buildTodayEntries, buildHistoryEntries,
    type SummaryEntry, type SummaryKind, type SummaryTone, type SummaryViewer,
} from '../utils/recordSummary';
import { useDayEvents } from '../services/useDayEvents';
import { localDateIso } from '../utils/helpers';
import HeadInjuryIcon from './HeadInjuryIcon';

export const KindIcon = ({ kind, size = 20, box = 36 }: { kind: SummaryKind; size?: number; box?: number }) => {
    const s = KIND_STYLES[kind];
    return (
        <div aria-hidden="true" style={{ width: box, height: box, borderRadius: box >= 48 ? '12px' : '10px', backgroundColor: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {s.icon === 'head_injury_custom' ? <HeadInjuryIcon size={size} color={s.color} /> : <span className="material-icons-round" style={{ fontSize: `${size}px` }}>{s.icon}</span>}
        </div>
    );
};

const TONE_COLORS: Record<SummaryTone, { fg: string; bg: string }> = {
    success: { fg: '#047857', bg: 'var(--color-success-bg)' },
    info: { fg: '#1d4ed8', bg: '#dbeafe' },
    warning: { fg: '#92400e', bg: 'var(--color-warning-bg)' },
    danger: { fg: '#b91c1c', bg: 'var(--color-danger-bg)' },
    neutral: { fg: 'var(--text-secondary)', bg: 'var(--bg-hover)' },
};

export const StatusChip = ({ tone, children }: { tone: SummaryTone; children: React.ReactNode }) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color: TONE_COLORS[tone].fg, backgroundColor: TONE_COLORS[tone].bg }}>
        {children}
    </span>
);

/** Student-page sections a summary line can open. */
export type SummarySection = 'attendance' | 'behavior' | 'wecare' | 'injury' | 'guardians';
const SECTION_FOR: Partial<Record<SummaryKind, SummarySection>> = {
    attendance: 'attendance', behavior: 'behavior', wecare: 'wecare', injury: 'injury', guardians: 'guardians',
};

interface StudentSummaryProps {
    student: Student;
    program: ProgramType;
    viewer: SummaryViewer;
    parentReports: ParentReport[];
    /** False while a section can't be opened (e.g. reports after check-out). */
    canOpen: (section: SummarySection) => boolean;
    onOpen: (section: SummarySection) => void;
}

const titleColor = (tone: SummaryTone) => (tone === 'danger' ? '#dc2626' : tone === 'warning' ? '#b45309' : 'var(--text-main)');

const SummaryRow = ({ entry, expanded, onActivate }: { entry: SummaryEntry; expanded: boolean; onActivate?: () => void }) => {
    const content = (
        <>
            <KindIcon kind={entry.kind} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: titleColor(entry.tone) }}>{entry.title}</div>
                {entry.detail && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{entry.detail}</div>}
                {expanded && entry.body && (
                    <div style={{ marginTop: '8px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>
                        {entry.body}
                    </div>
                )}
            </div>
            {onActivate && (
                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '20px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    {entry.body ? (expanded ? 'expand_less' : 'expand_more') : 'chevron_right'}
                </span>
            )}
        </>
    );
    const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%', padding: '10px 16px', boxSizing: 'border-box', textAlign: 'left' };
    return (
        <li>
            {onActivate ? (
                <button type="button" onClick={onActivate} aria-expanded={entry.body ? expanded : undefined} style={{ ...rowStyle, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                    {content}
                </button>
            ) : (
                <div style={rowStyle}>{content}</div>
            )}
        </li>
    );
};

const StudentSummary = ({ student, program, viewer, parentReports, canOpen, onOpen }: StudentSummaryProps) => {
    const today = localDateIso();
    // null = today, so the card follows the clock if the page stays open past midnight.
    const [pickedDate, setPickedDate] = useState<string | null>(null);
    const [openLetterId, setOpenLetterId] = useState<string | null>(null);
    const date = pickedDate ?? today;
    const isToday = pickedDate === null;

    const roster = useMemo(() => [student], [student]);
    // Only the Lead reads the database here: today it supplies sent letters
    // (Lead-only), and only the Lead can pick an earlier day.
    const day = useDayEvents(date, student.id, roster, viewer.isLead);

    const entries = useMemo(
        () => (isToday
            ? buildTodayEntries(student, { program, viewer, parentReports, dayEvents: day.events })
            : buildHistoryEntries(day.events, viewer)),
        [isToday, student, program, viewer, parentReports, day.events],
    );

    if (!viewer.isLead && entries.length === 0) return null;

    const isSample = !isToday && day.events.length > 0 && day.events.every(e => e.localOnly);
    const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const showEmptyDay = !isToday && entries.length === 0 && !day.loading;
    const hasBody = entries.length > 0 || showEmptyDay || (!isToday && day.loading) || !!day.error;

    const activate = (entry: SummaryEntry): (() => void) | undefined => {
        if (entry.body) return () => setOpenLetterId(id => (id === entry.id ? null : entry.id));
        const section = SECTION_FOR[entry.kind];
        if (isToday && section && canOpen(section)) return () => onOpen(section);
        return undefined;
    };

    const chipButton: React.CSSProperties = { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };

    return (
        <section aria-label={isToday ? 'Today' : dateLabel} style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px 16px', borderBottom: hasBody ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        {isToday ? 'Today' : dateLabel}
                    </span>
                    {isSample && <StatusChip tone="warning">Sample data</StatusChip>}
                </div>
                {viewer.isLead && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!isToday && <button type="button" onClick={() => { setPickedDate(null); setOpenLetterId(null); }} style={chipButton}>Back to today</button>}
                        <input
                            type="date"
                            aria-label="Show another day"
                            title="Show another day"
                            max={today}
                            value={date}
                            onChange={e => {
                                const v = e.target.value;
                                if (!v) return;
                                setPickedDate(v >= today ? null : v);
                                setOpenLetterId(null);
                            }}
                            style={{ ...chipButton, fontWeight: 600, fontFamily: 'inherit' }}
                        />
                    </div>
                )}
            </div>

            {day.error && (
                <div role="alert" style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--color-danger-bg)', color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>
                    Couldn't load saved records{isToday ? ' (sent letters)' : ''} for this day. Showing only what was recorded on this device.
                </div>
            )}

            {!isToday && day.loading && entries.length === 0 ? (
                <div style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>
            ) : showEmptyDay ? (
                <div style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Nothing was recorded for {student.firstName} on this day.
                </div>
            ) : entries.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
                    {entries.map(entry => (
                        <SummaryRow key={entry.id} entry={entry} expanded={openLetterId === entry.id} onActivate={activate(entry)} />
                    ))}
                </ul>
            )}
        </section>
    );
};

export default StudentSummary;
