// src/services/auditLog.ts — Append-only record of attendance and report activity
//
// Every check-in, check-out, undo and report action is recorded here as an
// immutable event. Events are never edited or removed: an undone check-in is a
// second event, not a deletion of the first.
//
// Storage:
//   • Always kept in memory for this session, so the Daily Records view works
//     even with the built-in sample roster.
//   • When Supabase is configured AND the student is a real database record
//     (uuid id), the event is also inserted into public.attendance_events. That
//     table has no UPDATE or DELETE policy and a trigger that rejects both, and
//     its recorded_by column is filled server-side from auth.uid() — so the
//     database, not this client, decides who an event is attributed to.

import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured, runDbWrite } from '../supabaseClient';
import { uuidv4, isUuid } from '../utils/helpers';
import type { ProgramType } from '../types';

export type AuditEventType =
    | 'check_in'
    | 'check_in_undone'
    | 'checkout_requested'
    | 'checked_out'
    | 'behavior_submitted'
    | 'head_injury_started'
    | 'parent_report_sent';

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
    check_in: 'Checked in',
    check_in_undone: 'Check-in undone',
    checkout_requested: 'Pickup started',
    checked_out: 'Checked out',
    behavior_submitted: 'Behavior ticket submitted',
    head_injury_started: 'Head injury report started',
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
    /** True once the database has accepted the event. */
    persisted: boolean;
}

export type NewAuditEvent = Omit<AuditEvent, 'id' | 'occurredAt' | 'persisted'> & { occurredAt?: string };

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
    persisted: true,
});

export interface RecordResult {
    /** Accepted by the database. */
    persisted: number;
    /** Should have reached the database but did not — the caller should warn. */
    failed: number;
    /** Sample-data events that are intentionally kept on this device only. */
    localOnly: number;
}

/**
 * Appends events. Resolves after the database write (if any) finishes; never
 * throws, so a logging failure cannot break a check-in.
 */
export const recordEvents = async (input: NewAuditEvent[]): Promise<RecordResult> => {
    if (input.length === 0) return { persisted: 0, failed: 0, localOnly: 0 };

    const now = new Date().toISOString();
    const created: AuditEvent[] = input.map(e => Object.freeze({
        ...e,
        id: uuidv4(),
        occurredAt: e.occurredAt ?? now,
        persisted: false,
    }));
    setEvents([...events, ...created]);

    const remote = isSupabaseConfigured ? created.filter(e => isUuid(e.studentId)) : [];
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

/**
 * Database events for one day (optionally one student). Returns null when there
 * is no database to ask — sample roster, or Supabase not configured — and also
 * on a read error, which is logged.
 */
export const fetchRemoteDayEvents = async (isoDate: string, studentId?: string): Promise<AuditEvent[] | null> => {
    if (!isSupabaseConfigured || (studentId && !isUuid(studentId))) return null;
    const [start, end] = dayBounds(isoDate);

    let query = supabase
        .from('attendance_events')
        .select('id, student_id, student_name, event_type, program, occurred_at, staff_name, batch_id, detail')
        .gte('occurred_at', start.toISOString())
        .lt('occurred_at', end.toISOString())
        .order('occurred_at', { ascending: true })
        .limit(1000);
    if (studentId) query = query.eq('student_id', studentId);

    try {
        const { data, error } = await query;
        if (error) {
            console.warn('[Audit] attendance_events read failed:', error.message);
            return null;
        }
        return (data as AttendanceEventRow[]).map(fromRow);
    } catch (err) {
        console.warn('[Audit] attendance_events read failed:', err instanceof Error ? err.message : err);
        return null;
    }
};

/** Union of two event lists by id; the database copy wins. Oldest first. */
export const mergeEvents = (local: readonly AuditEvent[], remote: readonly AuditEvent[]): AuditEvent[] => {
    const merged = new Map<string, AuditEvent>();
    local.forEach(e => merged.set(e.id, e));
    remote.forEach(e => merged.set(e.id, e));
    return [...merged.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
};
