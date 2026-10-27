// src/services/attendanceWrites.ts — Conditional attendance writes for database students
//
// Each write states the condition the row must still meet, and returns the
// rows the database actually changed. Callers keep only those changes on
// screen and in the Program Log — so two devices acting on the same child,
// or a stale copy of the roster, can never record something twice or undo
// somebody else's action.
//
// PostgREST rejects or()/and() filters on updates ("column … does not exist"),
// so these use only simple per-column filters; an OR is split into two requests.

import { supabase, runDbRows } from '../supabaseClient';
import type { ProgramType } from '../types';

type Client = typeof supabase;
type Ids = { id: string }[];

/**
 * Check-in for rows that are absent, or carry a status from another day (or no
 * date at all), and are not blocked. `complete` is false if a request failed —
 * the outcome for students not in `applied` is then unknown.
 */
export const persistCheckIn = async (
    ids: string[], p: ProgramType, time: string, staffName: string, day: string, client: Client = supabase,
): Promise<{ applied: Set<string>; complete: boolean }> => {
    if (ids.length === 0) return { applied: new Set(), complete: true };
    const fields = {
        [`${p}_status`]: 'present',
        [`${p}_checkin_time`]: time,
        [`${p}_staff`]: staffName,
        [`${p}_checkout_time`]: null, // a fresh day: clear any earlier checkout
        [`${p}_date`]: day,
    };
    // Each row's condition is re-checked as it is written, so once one request
    // (or another device) checks a child in, every later one matches nothing.
    const absent = await runDbRows<{ id: string }>('Check-in', () => client.from('students')
        .update(fields).in('id', ids)
        .eq(`${p}_status`, 'absent')
        .not('is_checkin_blocked', 'is', true)
        .select('id'));
    if (absent === null) return { applied: new Set(), complete: false };
    const applied = new Set(absent.map(r => r.id));
    const rest = ids.filter(id => !applied.has(id));
    if (rest.length === 0) return { applied, complete: true };

    const staleDay = await runDbRows<{ id: string }>('Check-in', () => client.from('students')
        .update(fields).in('id', rest)
        .filter(`${p}_date`, 'isdistinct', day)
        .not('is_checkin_blocked', 'is', true)
        .select('id'));
    (staleDay ?? []).forEach(r => applied.add(r.id));
    return { applied, complete: staleDay !== null };
};

/** Reverts a check-in only where the row still carries exactly that check-in. Null = request failed. */
export const persistUndoCheckIn = (
    ids: string[], p: ProgramType, time: string, staffName: string, day: string, client: Client = supabase,
): Promise<Ids | null> => runDbRows<{ id: string }>('Undo check-in', () => client.from('students')
    .update({ [`${p}_status`]: 'absent', [`${p}_checkin_time`]: null, [`${p}_staff`]: null })
    .in('id', ids)
    .eq(`${p}_status`, 'present')
    .eq(`${p}_checkin_time`, time)
    .eq(`${p}_staff`, staffName)
    .eq(`${p}_date`, day)
    .select('id'));

/** Check-out only if the child is still checked in today. Null = request failed. */
export const persistCheckOut = (
    id: string, p: ProgramType, time: string, staffName: string, smsTime: string, day: string, client: Client = supabase,
): Promise<Ids | null> => runDbRows<{ id: string }>('Check-out', () => client.from('students')
    .update({ [`${p}_status`]: 'checked_out', [`${p}_checkout_time`]: time, last_checkout_by: staffName, sms_sent_time: smsTime })
    .eq('id', id)
    .in(`${p}_status`, ['present', 'pending_parent'])
    .eq(`${p}_date`, day)
    .select('id'));

/** Scheduled Sunrise check-out for children still in the building today. Null = request failed. */
export const persistBatchCheckOut = (
    ids: string[], label: string, day: string, client: Client = supabase,
): Promise<Ids | null> => runDbRows<{ id: string }>('Batch checkout', () => client.from('students')
    .update({ sunrise_status: 'checked_out', sunrise_checkout_time: label })
    .in('id', ids)
    .in('sunrise_status', ['present', 'pending_parent'])
    .eq('sunrise_date', day)
    .select('id'));
