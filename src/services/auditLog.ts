// src/services/auditLog.ts — Append-only record of attendance and report activity
//
// Every check-in, check-out, undo and report action is recorded here as an
// immutable event. Events are never edited or removed: an undone check-in is a
// second event, not a deletion of the first.
//
// Storage:
//   • Always kept in memory for this session, so the Program Log and student summaries work
//     even with the built-in sample roster.
//   • When Supabase is configured AND the student is a real database row (see
//     dbStudents.ts), the event is also inserted into public.attendance_events.
//     That table has no UPDATE or DELETE policy and a trigger that rejects
//     both, and its recorded_by column is checked against auth.uid() — so the
//     database, not this client, decides who an event is attributed to.
//
// Callers record an event only after the attendance change it describes has
// been confirmed by the database, so a "check-in" entry never describes a
// check-in that failed to save.

import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured, runDbWrite } from '../supabaseClient';
import { uuidv4, isUuid } from '../utils/helpers';
import { isDbStudent } from './dbStudents';
import type { ProgramType } from '../types';

export type AuditEventType =
    | 'check_in'
    | 'check_in_undone'
    | 'checkout_requested'
    | 'checked_out'
    | 'behavior_submitted'
    | 'we_care_submitted'
    | 'head_injury_started'
    | 'head_injury_check'
    | 'parent_report_sent';

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
    check_in: 'Checked in',
    check_in_undone: 'Check-in undone',
    checkout_requested: 'Pickup started',
    checked_out: 'Checked out',
    behavior_submitted: 'Behavior ticket submitted',
    we_care_submitted: 'We Care report submitted',
    head_injury_started: 'Head injury report started',
    head_injury_check: 'Head injury check recorded',
    parent_report_sent: 'Parent report approved',
};

export interface AuditEvent {
    id: string;
    studentId: string;
    studentName: string;
    type: AuditEventType;
    program?: ProgramType;
    /** ISO timestamp. */
    occurredAt: string;
    staffName: string;
    /** Shared by every event produced by one group action (e.g. a group check-in). */
    batchId?: string;
    detail?: string;
    /** Full text of a parent letter, on parent_report_sent events only. */
    body?: string;
    /** True once the database has accepted the event. */
    persisted: boolean;
    /**
     * True when the event is intentionally kept on this device only: sample
     * students, students added or imported this session, or no database
     * configured. An event that is neither persisted nor localOnly FAILED to save.
     */
    localOnly: boolean;
}

export type NewAuditEvent = Omit<AuditEvent, 'id' | 'occurredAt' | 'persisted' | 'localOnly'> & { occurredAt?: string };

// ── In-memory store ──────────────────────────────────────────────────────────

let events: readonly AuditEvent[] = [];
const listeners = new Set<() => void>();

const setEvents = (next: readonly AuditEvent[]) => {
    events = next;
    listeners.forEach(l => l());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** Live list of this session's events (oldest first). */
export const useAuditEvents = (): readonly AuditEvent[] =>
    useSyncExternalStore(subscribe, () => events);

/** Forgets this session's events — on logout, so the next person on the device can't see them. */
export const clearSessionEvents = () => setEvents([]);

// ── Writing ──────────────────────────────────────────────────────────────────

interface AttendanceEventRow {
    id: string;
    student_id: string;
    student_name: string;
    event_type: AuditEventType;
    program: ProgramType | null;
    occurred_at: string;
    staff_name: string;
    batch_id: string | null;
    detail: string | null;
    /** Added by migration 20261026000000; absent from rows read before it is applied. */
    body?: string | null;
}

const toRow = (e: AuditEvent): AttendanceEventRow => ({
    id: e.id,
    student_id: e.studentId,
    student_name: e.studentName,
    event_type: e.type,
    program: e.program ?? null,
    occurred_at: e.occurredAt,
    staff_name: e.staffName,
    batch_id: e.batchId ?? null,
    detail: e.detail ?? null,
    // Only letters send the key, so every other event still saves on a
    // database where the body column has not been added yet.
    ...(e.body !== undefined ? { body: e.body } : {}),
});

const fromRow = (r: AttendanceEventRow): AuditEvent => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    type: r.event_type,
    program: r.program ?? undefined,
    occurredAt: r.occurred_at,
    staffName: r.staff_name,
    batchId: r.batch_id ?? undefined,
    detail: r.detail ?? undefined,
    body: r.body ?? undefined,
    persisted: true,
    localOnly: false,
});

export interface RecordResult {
    /** Accepted by the database. */
    persisted: number;
    /** Should have reached the database but did not — the caller should warn. */
    failed: number;
    /** Intentionally kept on this device only (sample / session-only students). */
    localOnly: number;
}

/**
 * Appends events. Resolves after the database write (if any) finishes; never
 * throws, so a logging failure cannot break a check-in. Failed events stay in
 * memory, marked as failed, until logout or reload — there is no retry queue.
 */
export const recordEvents = async (input: NewAuditEvent[]): Promise<RecordResult> => {
    if (input.length === 0) return { persisted: 0, failed: 0, localOnly: 0 };

    const now = new Date().toISOString();
    const created: AuditEvent[] = input.map(e => Object.freeze({
        ...e,
        id: uuidv4(),
        occurredAt: e.occurredAt ?? now,
        persisted: false,
        localOnly: !(isSupabaseConfigured && isDbStudent(e.studentId)),
    }));
    setEvents([...events, ...created]);

    const remote = created.filter(e => !e.localOnly);
    const localOnly = created.length - remote.length;
    if (remote.length === 0) return { persisted: 0, failed: 0, localOnly };

    // runDbWrite logs PostgREST's message only — no student data in the console.
    const saved = await runDbWrite('Audit', () => supabase.from('attendance_events').insert(remote.map(toRow)));
    if (!saved) return { persisted: 0, failed: remote.length, localOnly };

    const ok = new Set(remote.map(e => e.id));
    setEvents(events.map(e => (ok.has(e.id) ? Object.freeze({ ...e, persisted: true }) : e)));
    return { persisted: remote.length, failed: 0, localOnly };
};

// ── Reading ──────────────────────────────────────────────────────────────────

/** Local-time [start, end) bounds of a YYYY-MM-DD calendar day. */
export const dayBounds = (isoDate: string): [Date, Date] => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return [new Date(y, m - 1, d), new Date(y, m - 1, d + 1)];
};

/** Events from `list` on one day (optionally one student), oldest first. */
export const filterDayEvents = (list: readonly AuditEvent[], isoDate: string, studentId?: string): AuditEvent[] => {
    const [start, end] = dayBounds(isoDate);
    return list
        .filter(e => {
            const t = new Date(e.occurredAt).getTime();
            return t >= start.getTime() && t < end.getTime() && (!studentId || e.studentId === studentId);
        })
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
};

export type RemoteDayResult =
    /** No database to ask (not configured, or a session-only student). */
    | { status: 'unavailable' }
    /** The read failed — the view must not present this as "nothing recorded". */
    | { status: 'error'; message: string }
    | { status: 'ok'; rows: AuditEvent[]; truncated: boolean };

const PAGE_SIZE = 1000;   // Supabase's default per-request row cap
const MAX_PAGES = 20;     // 20,000 events for one day — far beyond any site

/** Database events for one day (optionally one student), paged until complete. */
export const fetchRemoteDayEvents = async (isoDate: string, studentId?: string): Promise<RemoteDayResult> => {
    if (!isSupabaseConfigured || (studentId && !isUuid(studentId))) return { status: 'unavailable' };
    const [start, end] = dayBounds(isoDate);
    const rows: AuditEvent[] = [];

    try {
        for (let page = 0; page < MAX_PAGES; page++) {
            let query = supabase
                .from('attendance_events')
                // '*' rather than a column list, so reads keep working whether or
                // not the body column (migration 20261026000000) exists yet.
                .select('*')
                .gte('occurred_at', start.toISOString())
                .lt('occurred_at', end.toISOString())
                // id breaks ties so pages never overlap or skip rows with equal timestamps.
                .order('occurred_at', { ascending: true })
                .order('id', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            if (studentId) query = query.eq('student_id', studentId);

            const { data, error } = await query;
            if (error) {
                console.warn('[Audit] attendance_events read failed:', error.message);
                return { status: 'error', message: error.message };
            }
            const batch = (data as AttendanceEventRow[]).map(fromRow);
            rows.push(...batch);
            if (batch.length < PAGE_SIZE) return { status: 'ok', rows, truncated: false };
        }
        return { status: 'ok', rows, truncated: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[Audit] attendance_events read failed:', message);
        return { status: 'error', message };
    }
};

/** Union of two event lists by id; the database copy wins. Oldest first. */
export const mergeEvents = (local: readonly AuditEvent[], remote: readonly AuditEvent[]): AuditEvent[] => {
    const merged = new Map<string, AuditEvent>();
    local.forEach(e => merged.set(e.id, e));
    remote.forEach(e => merged.set(e.id, e));
    return [...merged.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
};
