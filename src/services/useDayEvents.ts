// src/services/useDayEvents.ts — One day's events, for one student or the whole program
//
// Merges this session's events, the database's (when there is one) and, for
// past days, the made-up history of the built-in sample students (demo only).
import { useEffect, useMemo, useState } from 'react';
import type { Student } from '../types';
import { isSupabaseConfigured } from '../supabaseClient';
import { localDateIso } from '../utils/helpers';
import { sampleHistoryEvents } from '../utils/sampleHistory';
import { isSampleStudent } from '../utils/mockData';
import {
    useAuditEvents, fetchRemoteDayEvents, filterDayEvents, mergeEvents,
    type AuditEvent, type RemoteDayResult,
} from './auditLog';

export interface DayEvents {
    /** Oldest first. */
    events: AuditEvent[];
    /** The database part has not arrived yet. */
    loading: boolean;
    /** The database read failed, so `events` holds only this device's entries. */
    error: string | null;
    /** The day had more rows than one read returns; `events` is incomplete. */
    truncated: boolean;
}

/**
 * @param students roster to draw sample history from; pass a stable array (state or useMemo).
 * @param enabled  false skips the database read, for viewers who don't need it.
 */
export const useDayEvents = (date: string, studentId: string | undefined, students: readonly Student[], enabled = true): DayEvents => {
    const sessionEvents = useAuditEvents();
    // Each database result remembers the query it answers, so while a new day
    // loads the previous day's rows are never shown (or exported) under it.
    const [remote, setRemote] = useState<{ key: string; result: RemoteDayResult } | null>(null);
    const key = `${date}|${studentId ?? '*'}`;

    // Re-read when the day changes or this session records a new event.
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        fetchRemoteDayEvents(date, studentId).then(result => {
            if (!cancelled) setRemote({ key, result });
        });
        return () => { cancelled = true; };
    }, [key, enabled, sessionEvents.length]);

    const current = enabled && remote?.key === key ? remote.result : null;

    const sample = useMemo(
        () => sampleHistoryEvents(students.filter(s => isSampleStudent(s.id) && (!studentId || s.id === studentId)), date, localDateIso()),
        [students, date, studentId],
    );

    const events = useMemo(
        // Filter the merged list, not just the session part, so no row from another day or student can slip in.
        () => filterDayEvents(mergeEvents([...sessionEvents, ...sample], current?.status === 'ok' ? current.rows : []), date, studentId),
        [sessionEvents, sample, current, date, studentId],
    );

    return {
        events,
        loading: enabled && isSupabaseConfigured && current === null,
        error: current?.status === 'error' ? current.message : null,
        truncated: current?.status === 'ok' && current.truncated,
    };
};
