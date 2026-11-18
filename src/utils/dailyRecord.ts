// src/utils/dailyRecord.ts — One day of attendance, rebuilt from the event log
//
// The sign-in/out sheet (when each student arrived and left, and who picked
// them up) and what is still open: a check-in with no check-out, a pickup that
// was never confirmed, head injury checks not finished. While a session is
// running, a student still here is listed but not flagged; once it has closed,
// or for an earlier day, the item is flagged so a Lead can follow up that day.
// Used by the Program Log, the printed Daily Report and the Student Daily Report.

import type { ProgramType, Student } from '../types';
import type { AuditEvent } from '../services/auditLog';
import { GRADES } from '../constants';
import { formatClockTime, localDateIso } from './helpers';
import { formatReleaseTime } from './releaseForms';

export const SESSIONS: ProgramType[] = ['sunrise', 'sunset'];
export const SESSION_LABEL: Record<ProgramType, string> = { sunrise: 'Sunrise', sunset: 'Sunset' };

/**
 * When each session ends: Sunrise with the batch check-out when school starts
 * (8:00 AM by default), Sunset with the program day (6:00 PM, the program
 * hours printed on the Early Release Form).
 */
export const SESSION_CLOSES: Record<ProgramType, string> = { sunrise: '08:00', sunset: '18:00' };
export const closesAt = (p: ProgramType): string => formatReleaseTime(SESSION_CLOSES[p]);

export const clockOf = (e: AuditEvent): string => formatClockTime(new Date(e.occurredAt));

// ── The sign-in/out sheet ────────────────────────────────────────────────────

export interface SessionDay {
    checkIn?: AuditEvent;
    /** A pickup that was started (the guardian text sent), confirmed by the check-out. */
    pickup?: AuditEvent;
    checkOut?: AuditEvent;
    /** Check-ins undone in this session. Each undo is its own entry; nothing is erased. */
    undone: AuditEvent[];
}

/**
 * Replays one student's attendance entries for a day, per session. An undo
 * cancels the check-in before it; a later check-in starts a new visit.
 */
export const replaySessions = (events: readonly AuditEvent[]): Record<ProgramType, SessionDay> => {
    const days: Record<ProgramType, SessionDay> = { sunrise: { undone: [] }, sunset: { undone: [] } };
    events.forEach(e => {
        if (!e.program) return;
        const d = days[e.program];
        if (e.type === 'check_in') { d.checkIn = e; d.pickup = undefined; d.checkOut = undefined; }
        else if (e.type === 'check_in_undone') { d.checkIn = undefined; d.undone.push(e); }
        else if (e.type === 'checkout_requested') d.pickup = e;
        else if (e.type === 'checked_out') d.checkOut = e;
    });
    return days;
};

export interface AttendanceRow {
    studentId: string;
    name: string;
    grade: string;
    /** The student on the current roster, if they are still on it. */
    student?: Student;
    sessions: Record<ProgramType, SessionDay>;
}

const ATTENDANCE_TYPES = new Set<AuditEvent['type']>(['check_in', 'check_in_undone', 'checkout_requested', 'checked_out']);

const gradeIndex = (g: string) => (GRADES.includes(g) ? GRADES.indexOf(g) : GRADES.length);
const nameParts = (r: { name: string; student?: Student }) =>
    (r.student ? [r.student.firstName, r.student.lastName] : [r.name.split(' ')[0] ?? '', r.name.split(' ').slice(1).join(' ')]);

/** Roster order, as on the app's roster: grade (TK, K, then 1 to 5), then first name, then last name. */
export const rosterOrder = (a: { name: string; grade: string; student?: Student }, b: { name: string; grade: string; student?: Student }) => {
    const [fa, la] = nameParts(a), [fb, lb] = nameParts(b);
    return gradeIndex(a.grade) - gradeIndex(b.grade) || fa.localeCompare(fb) || la.localeCompare(lb);
};

/** Who an event is about: the roster entry if the student is still on it. */
const personOf = (studentId: string, fallbackName: string, byId: Map<string, Student>) => {
    const s = byId.get(studentId);
    return { studentId, student: s, name: s ? `${s.firstName} ${s.lastName}` : fallbackName, grade: s?.grade ?? '' };
};

const byStudent = (events: readonly AuditEvent[]) => {
    const groups = new Map<string, AuditEvent[]>();
    events.forEach(e => {
        const list = groups.get(e.studentId);
        if (list) list.push(e); else groups.set(e.studentId, [e]);
    });
    return groups;
};

/** One row per student with any attendance entry that day, in roster order. */
export const attendanceSheet = (events: readonly AuditEvent[], students: readonly Student[]): AttendanceRow[] => {
    const byId = new Map(students.map(s => [s.id, s]));
    return [...byStudent(events.filter(e => ATTENDANCE_TYPES.has(e.type)))]
        .map(([id, list]) => ({ ...personOf(id, list[0].studentName, byId), sessions: replaySessions(list) }))
        .sort(rosterOrder);
};

/** Who the student left with, from the check-out entry (or the pickup that started it). "Contact 1: Rosa Garcia" reads "Rosa Garcia (Contact 1)". */
export const releasedTo = (d: SessionDay): string | undefined => {
    for (const e of [d.checkOut, d.pickup]) {
        const detail = e?.detail ?? '';
        if (/batch checkout/i.test(detail)) return 'The school day (batch check-out)';
        const m = detail.match(/^(?:Released to|Pickup by) (.+?)(?: · |$)/);
        if (m) {
            const contact = m[1].match(/^(Contact \d+): (.+)$/);
            return contact ? `${contact[2]} (${contact[1]})` : m[1];
        }
    }
    return undefined;
};

/** "reason 4. Medical Appointments, approved from 1:15 PM" when a signed Early Release Form covered the pickup. */
export const earlyReleaseNote = (d: SessionDay): string | undefined => {
    for (const e of [d.checkOut, d.pickup]) {
        const m = e?.detail?.match(/early release form on file \((.+)\)/);
        if (m) return m[1];
    }
    return undefined;
};

export const minutesAttended = (d: SessionDay): number | null =>
    (d.checkIn && d.checkOut ? Math.max(0, Math.round((Date.parse(d.checkOut.occurredAt) - Date.parse(d.checkIn.occurredAt)) / 60_000)) : null);

export const formatDuration = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

// ── What is still open ───────────────────────────────────────────────────────

export type OpenItemKind = 'no_checkout' | 'pickup_unconfirmed' | 'injury_checks';

export interface OpenItem {
    id: string;
    studentId: string;
    name: string;
    grade: string;
    student?: Student;
    program?: ProgramType;
    kind: OpenItemKind;
    /** It should be done by now: the session has closed, the checks are past due, or the day is over. */
    overdue: boolean;
    /** "No check-out recorded" */
    title: string;
    /** "Sunset · checked in 2:47 PM by Coach Mike" */
    detail: string;
}

/** A clock time on a given day: "18:00" on "2026-11-18". */
const onDay = (iso: string, hhmm: string): Date => {
    const [y, m, d] = iso.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
};

/** Head injury checks: 15 and 30 minutes after the report is started; flagged 5 minutes after the last is due. */
const INJURY_CHECKS = 2;
const INJURY_DONE_BY_MIN = 35;

/** Everything not finished on a day, flagged ones first, then in roster order. */
export const openItems = (events: readonly AuditEvent[], students: readonly Student[], date: string, now: Date = new Date()): OpenItem[] => {
    const isPast = date < localDateIso(now);
    const byId = new Map(students.map(s => [s.id, s]));
    const items: OpenItem[] = [];

    attendanceSheet(events, students).forEach(r => SESSIONS.forEach(p => {
        const d = r.sessions[p];
        if (!d.checkIn || d.checkOut) return;
        const overdue = isPast || now >= onDay(date, SESSION_CLOSES[p]);
        const checkedIn = `checked in ${clockOf(d.checkIn)} by ${d.checkIn.staffName}`;
        const base = { id: `${r.studentId}-${p}`, studentId: r.studentId, name: r.name, grade: r.grade, student: r.student, program: p, overdue };
        if (d.pickup) {
            const who = releasedTo(d);
            items.push({
                ...base, kind: 'pickup_unconfirmed',
                title: overdue ? 'Pickup never confirmed' : 'Pickup in progress',
                detail: `${SESSION_LABEL[p]} · pickup${who ? ` by ${who}` : ''} started ${clockOf(d.pickup)} · ${checkedIn}`,
            });
        } else {
            items.push({
                ...base, kind: 'no_checkout',
                title: overdue ? 'No check-out recorded' : 'Still checked in',
                detail: `${SESSION_LABEL[p]} · ${checkedIn}${overdue && !isPast ? ` · the session closed at ${closesAt(p)}` : ''}`,
            });
        }
    }));

    byStudent(events.filter(e => e.type === 'head_injury_started' || e.type === 'head_injury_check')).forEach((list, id) => {
        const start = list.find(e => e.type === 'head_injury_started');
        if (!start) return;
        const checks = list.filter(e => e.type === 'head_injury_check' && e.occurredAt >= start.occurredAt).length;
        if (checks >= INJURY_CHECKS) return;
        const overdue = isPast || now.getTime() >= Date.parse(start.occurredAt) + INJURY_DONE_BY_MIN * 60_000;
        items.push({
            ...personOf(id, start.studentName, byId), id: `${id}-injury`, program: start.program, kind: 'injury_checks', overdue,
            title: overdue ? 'Head injury checks not finished' : 'Head injury checks in progress',
            detail: `Report started ${clockOf(start)} by ${start.staffName} · ${checks} of ${INJURY_CHECKS} follow-up checks recorded`,
        });
    });

    return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || rosterOrder(a, b));
};
