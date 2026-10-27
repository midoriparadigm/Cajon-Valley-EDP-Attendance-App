// src/utils/recordSummary.ts — What happened for a student (or the whole program) on one day
//
// Student summary entries:
//   • Today: read from the live student record, i.e. what each tile opens to.
//   • Past days (Lead only): rebuilt from the append-only event log.
// Only things that happened produce an entry; there are no "nothing today" rows.
//
// Who sees what:
//   • Attendance: everyone.
//   • Green Card / We Care / Head Injury: the Lead, the staff member who filed
//     the report, and staff the Lead has given "See All Reports". The same rule
//     decides who can open those tiles on the student page (isReportRestricted).
//   • Parent letters and pending pickup approvals: the Lead only.

import type { Student, ParentReport, ProgramType } from '../types';
import type { AuditEvent, AuditEventType } from '../services/auditLog';
import { formatClockTime } from './helpers';

export type SummaryKind = 'attendance' | 'behavior' | 'wecare' | 'injury' | 'guardians' | 'letter';
export type SummaryTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

/** Icon and colors per kind: the same badge as the matching tile on the student page. */
export const KIND_STYLES: Record<SummaryKind, { icon: string; color: string; bg: string }> = {
    attendance: { icon: 'schedule', color: '#3b82f6', bg: '#dbeafe' },
    behavior: { icon: 'warning', color: '#16a34a', bg: '#dcfce7' },
    wecare: { icon: 'medication', color: '#ec4899', bg: '#fce7f3' },
    injury: { icon: 'head_injury_custom', color: '#ef4444', bg: '#fee2e2' },
    guardians: { icon: 'contact_phone', color: '#6366f1', bg: '#e0e7ff' },
    letter: { icon: 'mail', color: '#d97706', bg: '#fef3c7' },
};

export interface SummaryEntry {
    id: string;
    kind: SummaryKind;
    title: string;
    detail?: string;
    tone: SummaryTone;
    /** Short status for the matching tile ("Filed 3:02 PM"). Today's entries only. */
    badge?: string;
    /** Full text of a sent parent letter. */
    body?: string;
}

export interface SummaryViewer {
    /** Display name, e.g. "Veronica Thomas". */
    name: string;
    /** A Lead (or admin) with Lead mode on: sees everything. */
    isLead: boolean;
    canViewAllReports: boolean;
}

/** "Veronica Thomas (EDP)" and "Veronica Thomas" are the same person. */
const baseName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();

export const canSeeReport = (viewer: SummaryViewer, filedBy: (string | undefined)[]): boolean =>
    viewer.isLead || viewer.canViewAllReports || filedBy.some(n => !!n && baseName(n) === baseName(viewer.name));

const PROGRAM_LABEL: Record<ProgramType, string> = { sunrise: 'Sunrise', sunset: 'Sunset' };
const REPORT_TYPE_LABEL: Record<ParentReport['type'], string> = { behavior: 'Green Card', wecare: 'We Care', injury: 'Head injury' };

const clock = (ms: number) => formatClockTime(new Date(ms));
const join = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' · ') || undefined;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * When a report was filed, for display. Prefers the exact time; falls back to
 * the stored stamp ("10/26/26, 03:02 PM"). A report from an earlier day keeps
 * its date, so it is never passed off as today's.
 */
const filedAt = (now: Date, ms?: number, stamp?: string): string | undefined => {
    if (ms) {
        const d = new Date(ms);
        return sameDay(d, now) ? clock(ms) : `${d.toLocaleDateString()} ${clock(ms)}`;
    }
    if (!stamp) return undefined;
    const [datePart, timePart] = stamp.split(', ');
    const today = [
        now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' }),
        now.toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
    ];
    return timePart && today.includes(datePart) ? timePart.replace(/^0/, '') : stamp;
};

const listOf = (items: string[], max = 2) =>
    items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} +${items.length - max} more`;

// ── Today ────────────────────────────────────────────────────────────────────

export interface TodayContext {
    /** The program the board is showing now; its attendance entry carries the tile badge. */
    program: ProgramType;
    viewer: SummaryViewer;
    parentReports: ParentReport[];
    /** This student's events for today (session + database), for sent letters. */
    dayEvents: readonly AuditEvent[];
    now?: Date;
}

const attendanceToday = (s: Student, p: ProgramType, isCurrent: boolean): SummaryEntry | null => {
    const f = p === 'sunrise'
        ? { status: s.sunriseStatus, inAt: s.sunriseTime, outAt: s.sunriseCheckOutTime, staff: s.sunriseStaff }
        : { status: s.sunsetStatus, inAt: s.sunsetTime, outAt: s.sunsetCheckOutTime, staff: s.sunsetStaff };
    const label = PROGRAM_LABEL[p];
    const id = `attendance-${p}`;
    const by = f.staff ? `by ${f.staff}` : undefined;
    switch (f.status) {
        case 'present':
            return { id, kind: 'attendance', tone: 'success', title: `${label} · Checked in ${f.inAt ?? ''}`.trim(), detail: by, badge: isCurrent ? `Checked in ${f.inAt ?? ''}`.trim() : undefined };
        case 'pending_parent':
            return { id, kind: 'attendance', tone: 'info', title: `${label} · Pickup in progress`, detail: join(f.inAt && `Checked in ${f.inAt}`, by), badge: isCurrent ? 'Pickup in progress' : undefined };
        case 'checked_out':
            return {
                id, kind: 'attendance', tone: 'neutral',
                title: `${label} · ${f.inAt ?? '—'} – ${f.outAt ?? '—'}`,
                detail: join(f.staff && `Checked in by ${f.staff}`, s.lastCheckOutBy && `checked out by ${s.lastCheckOutBy}`),
                badge: isCurrent ? `Checked out ${f.outAt ?? ''}`.trim() : undefined,
            };
        default:
            return null;
    }
};

const injuryLog = (s: Student, stage: '0min' | '15min' | '30min') => (s.headInjuryLogs || []).find(l => l.stage === stage);

const injuryStartMs = (s: Student): number | undefined => {
    const first = injuryLog(s, '0min');
    return s.headInjuryStartTime ?? (first ? Date.parse(first.completedAt) : undefined);
};

/** The next head-injury check still to do (with its due time when known), or null once the 30-minute check is saved. */
export const nextHeadInjuryCheck = (s: Student): { label: string; due?: string } | null => {
    if (injuryLog(s, '30min')) return null;
    const next = !injuryLog(s, '0min') ? { label: 'initial check', mins: 0 } : !injuryLog(s, '15min') ? { label: '15-minute check', mins: 15 } : { label: '30-minute check', mins: 30 };
    const startMs = injuryStartMs(s);
    return { label: next.label, due: startMs && next.mins ? clock(startMs + next.mins * 60_000) : undefined };
};

const injuryToday = (s: Student): SummaryEntry => {
    const startMs = injuryStartMs(s);
    const started = startMs ? `started ${clock(startMs)}` : undefined;
    const next = nextHeadInjuryCheck(s);
    const last = injuryLog(s, '30min');
    if (!next && last) {
        return {
            id: 'injury', kind: 'injury', tone: 'neutral', title: 'Head injury · all checks done',
            detail: join(started, `last check ${clock(Date.parse(last.completedAt))} by ${last.staffName}`),
            badge: 'Checks complete',
        };
    }
    return {
        id: 'injury', kind: 'injury', tone: 'danger', title: 'Head injury · monitoring',
        detail: join(next && `Next: ${next.label}${next.due ? ` due ${next.due}` : ''}`, started, s.headInjuryWitness && `reported by ${s.headInjuryWitness}`),
        badge: next?.due ? `Next check ${next.due}` : 'Monitoring',
    };
};

// ── Report access (summary lines, tile badges and the tiles themselves) ─────

export type ReportKind = 'behavior' | 'wecare' | 'injury';

/**
 * Who filed a report on the student's record, or null when there is none.
 * A head-injury report counts from its witness statement on, before the
 * first check is saved; everyone who recorded a check counts as a filer.
 */
export const reportFiledBy = (s: Student, kind: ReportKind): (string | undefined)[] | null => {
    switch (kind) {
        case 'behavior':
            return s.behavior !== 'none' && (s.behaviorSubmittedAt || s.behaviorTimestamp) ? [s.behaviorFiledBy ?? s.behaviorStaff] : null;
        case 'wecare':
            return s.weCareSubmittedAt || s.weCareTimestamp ? [s.weCareStaff] : null;
        case 'injury':
            return s.headInjury || s.headInjuryWitnessDesc ? [s.headInjuryWitness, ...(s.headInjuryLogs || []).map(l => l.staffName)] : null;
    }
};

/** A report exists on the record, but this viewer may not see it. */
export const isReportRestricted = (s: Student, viewer: SummaryViewer, kind: ReportKind): boolean => {
    const filedBy = reportFiledBy(s, kind);
    return filedBy !== null && !canSeeReport(viewer, filedBy);
};

/** Sent-letter entries from parent_report_sent events. */
const letterEntries = (events: readonly AuditEvent[]): SummaryEntry[] =>
    events.filter(e => e.type === 'parent_report_sent').map(e => ({
        id: `letter-${e.id}`, kind: 'letter', tone: 'success',
        title: `Parent letter sent ${clock(Date.parse(e.occurredAt))}`,
        detail: join(`by ${e.staffName}`, e.detail, !e.body && 'letter text not saved'),
        body: e.body,
    }));

export const buildTodayEntries = (s: Student, ctx: TodayContext): SummaryEntry[] => {
    const { viewer, program } = ctx;
    const now = ctx.now ?? new Date();
    const entries: SummaryEntry[] = [];

    (['sunrise', 'sunset'] as const).forEach(p => {
        const e = attendanceToday(s, p, p === program);
        if (e) entries.push(e);
    });

    const behaviorBy = reportFiledBy(s, 'behavior');
    if (behaviorBy && canSeeReport(viewer, behaviorBy)) {
        const at = filedAt(now, s.behaviorSubmittedAt, s.behaviorTimestamp);
        const issues = s.behaviorIssues || [];
        entries.push({
            id: 'behavior', kind: 'behavior', tone: 'success',
            title: `Green Card filed${at ? ` ${at}` : ''}`,
            detail: join(s.behaviorStaff && `by ${s.behaviorStaff}`, issues.length > 0 && `${plural(issues.length, 'behavior')}: ${listOf(issues)}`, (s.behaviorEditCount ?? 0) > 0 && 'edited'),
            badge: at ? `Filed ${at}` : 'Filed',
        });
    }

    const weCareBy = reportFiledBy(s, 'wecare');
    if (weCareBy && canSeeReport(viewer, weCareBy)) {
        const at = filedAt(now, s.weCareSubmittedAt, s.weCareTimestamp);
        entries.push({
            id: 'wecare', kind: 'wecare', tone: 'info',
            title: `We Care report filed${at ? ` ${at}` : ''}`,
            detail: join(s.weCareStaff && `by ${s.weCareStaff}`, s.weCareActivity, (s.weCareFirstAid || []).length > 0 && `first aid: ${listOf(s.weCareFirstAid!)}`),
            badge: at ? `Filed ${at}` : 'Filed',
        });
    }

    const injuryBy = reportFiledBy(s, 'injury');
    if (s.headInjury && injuryBy && canSeeReport(viewer, injuryBy)) {
        entries.push(injuryToday(s));
    }

    if (viewer.isLead) {
        const drafts = ctx.parentReports.filter(r => r.studentId === s.id && r.status === 'draft');
        if (drafts.length > 0) {
            const types = [...new Set(drafts.map(r => REPORT_TYPE_LABEL[r.type] ?? r.type))];
            entries.push({
                id: 'letter-draft', kind: 'letter', tone: 'warning',
                title: 'Parent letter · awaiting your review',
                detail: join(types.join(' + '), 'open Parent Reports in the Leader Dashboard to send'),
            });
        }
        entries.push(...letterEntries(ctx.dayEvents));

        const pending = (s.guardians || []).filter(g => g.authStatus === 'pending');
        if (pending.length > 0) {
            entries.push({
                id: 'guardians', kind: 'guardians', tone: 'warning',
                title: pending.length === 1 ? 'Pickup approval pending' : `${pending.length} pickup approvals pending`,
                detail: pending.map(g => `${g.firstName} ${g.lastName} (${g.type})${g.authRequestedAt ? ` · requested ${g.authRequestedAt}` : ''}`).join('; '),
                badge: `${pending.length} awaiting approval`,
            });
        }
    }
    return entries;
};

/** The badge for a tile, if today's visible entries give it one. */
export const tileBadge = (entries: SummaryEntry[], kind: SummaryKind): SummaryEntry | undefined =>
    entries.find(e => e.kind === kind && e.badge);

// ── Past days (from the event log) ───────────────────────────────────────────

interface Visit { checkIn?: AuditEvent; pickup?: AuditEvent; checkOut?: AuditEvent }

/**
 * Replays one student-day of attendance events per program. An undone
 * check-in cancels the check-in before it; a later check-in starts a new visit.
 */
const replayVisits = (events: readonly AuditEvent[]): Partial<Record<ProgramType, Visit>> => {
    const visits: Partial<Record<ProgramType, Visit>> = {};
    events.forEach(e => {
        if (!e.program) return;
        const v = visits[e.program] ?? (visits[e.program] = {});
        if (e.type === 'check_in') { v.checkIn = e; v.pickup = undefined; v.checkOut = undefined; }
        else if (e.type === 'check_in_undone') { v.checkIn = undefined; }
        else if (e.type === 'checkout_requested') v.pickup = e;
        else if (e.type === 'checked_out') v.checkOut = e;
    });
    return visits;
};

const at = (e: AuditEvent) => clock(Date.parse(e.occurredAt));

/** One student's day rebuilt from events (oldest first). */
export const buildHistoryEntries = (events: readonly AuditEvent[], viewer: SummaryViewer): SummaryEntry[] => {
    const entries: SummaryEntry[] = [];

    const visits = replayVisits(events);
    (['sunrise', 'sunset'] as const).forEach(p => {
        const v = visits[p];
        if (!v || (!v.checkIn && !v.checkOut)) return;
        const label = PROGRAM_LABEL[p];
        const id = `attendance-${p}`;
        if (v.checkIn && v.checkOut) {
            entries.push({ id, kind: 'attendance', tone: 'neutral', title: `${label} · ${at(v.checkIn)} – ${at(v.checkOut)}`, detail: join(`Checked in by ${v.checkIn.staffName}`, v.checkOut.detail ?? `checked out by ${v.checkOut.staffName}`) });
        } else if (v.checkIn) {
            entries.push({ id, kind: 'attendance', tone: 'warning', title: `${label} · Checked in ${at(v.checkIn)}`, detail: join(`by ${v.checkIn.staffName}`, v.pickup ? `pickup started ${at(v.pickup)}, not confirmed` : 'no check-out recorded') });
        } else if (v.checkOut) {
            entries.push({ id, kind: 'attendance', tone: 'neutral', title: `${label} · Checked out ${at(v.checkOut)}`, detail: join(`by ${v.checkOut.staffName}`, v.checkOut.detail) });
        }
    });

    const injuryEvents = events.filter(e => e.type === 'head_injury_started' || e.type === 'head_injury_check');
    events.forEach(e => {
        if (e.type === 'behavior_submitted' && canSeeReport(viewer, [e.staffName])) {
            entries.push({ id: e.id, kind: 'behavior', tone: 'success', title: `Green Card filed ${at(e)}`, detail: join(`by ${e.staffName}`, e.detail) });
        } else if (e.type === 'we_care_submitted' && canSeeReport(viewer, [e.staffName])) {
            entries.push({ id: e.id, kind: 'wecare', tone: 'info', title: `We Care report filed ${at(e)}`, detail: join(`by ${e.staffName}`, e.detail) });
        } else if (e === injuryEvents[0] && canSeeReport(viewer, injuryEvents.map(i => i.staffName))) {
            const started = injuryEvents.find(i => i.type === 'head_injury_started');
            const checks = injuryEvents.filter(i => i.type === 'head_injury_check');
            const last = injuryEvents[injuryEvents.length - 1];
            entries.push({
                id: e.id, kind: 'injury', tone: 'danger',
                title: `Head injury report${started ? ` · started ${at(started)}` : ''}`,
                detail: join(started?.detail, checks.length > 0 && `${plural(checks.length, 'follow-up check')} recorded`, `last entry ${at(last)} by ${last.staffName}`),
            });
        }
    });

    if (viewer.isLead) entries.push(...letterEntries(events));
    return entries;
};

// ── Program-wide totals ──────────────────────────────────────────────────────

export interface DayTotals {
    /** Students with at least one check-in that was not undone. */
    checkedIn: number;
    /** Of those, students whose every visit ended in a check-out. */
    checkedOut: number;
    /** Checked in with no check-out recorded (still here, if the day is today). */
    notCheckedOut: number;
    /** Green Cards, We Care reports and head-injury reports started. */
    incidents: number;
    lettersSent: number;
}

const INCIDENT_TYPES: AuditEventType[] = ['behavior_submitted', 'we_care_submitted', 'head_injury_started'];

export const dayTotals = (events: readonly AuditEvent[]): DayTotals => {
    const byStudent = new Map<string, AuditEvent[]>();
    events.forEach(e => {
        const list = byStudent.get(e.studentId);
        if (list) list.push(e); else byStudent.set(e.studentId, [e]);
    });

    let checkedIn = 0;
    let notCheckedOut = 0;
    byStudent.forEach(list => {
        const visits = Object.values(replayVisits(list)).filter(v => v.checkIn);
        if (visits.length === 0) return;
        checkedIn += 1;
        if (visits.some(v => !v.checkOut)) notCheckedOut += 1;
    });

    return {
        checkedIn,
        checkedOut: checkedIn - notCheckedOut,
        notCheckedOut,
        incidents: events.filter(e => INCIDENT_TYPES.includes(e.type)).length,
        lettersSent: events.filter(e => e.type === 'parent_report_sent').length,
    };
};
