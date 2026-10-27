/// <reference types="vite/client" />
// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import type {
    StudentRecord,
    AttendanceRecord,
    BehaviorLogDB,
    HeadInjuryLogDB,
    CompositeStudent,
    Student,
    Staff
} from './types';
import { localDateIso } from './utils/helpers';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * False when the bundle was built without Supabase settings — e.g. a plain
 * `docker compose up` with no VITE_* variables exported. createClient() throws
 * on an empty URL, which used to crash the whole bundle at import time and
 * leave a blank page. Callers check this flag and skip network work instead;
 * the app then runs on its built-in sample roster only.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Where the signed-in session is kept in localStorage. Named explicitly (rather
 * than Supabase's derived default) so logout can always remove it — see
 * signOutAndForget().
 */
const AUTH_STORAGE_KEY = 'edp-attendance-auth';

const removeStoredSession = () => {
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(AUTH_STORAGE_KEY) || /^sb-.+-auth-token/.test(k))
            .forEach(k => localStorage.removeItem(k));
    } catch {
        // Storage unavailable (private mode, blocked site data) — nothing persisted to remove.
    }
};

// Sessions saved by earlier builds under Supabase's default key are no longer
// read; remove them so an old token does not linger on a shared device.
try {
    Object.keys(localStorage).filter(k => /^sb-.+-auth-token/.test(k)).forEach(k => localStorage.removeItem(k));
} catch { /* storage unavailable */ }

// `.invalid` is reserved (RFC 2606) and never resolves, and callers never issue
// requests when unconfigured — the placeholder only keeps createClient happy.
export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl : 'https://not-configured.invalid',
    isSupabaseConfigured ? supabaseAnonKey : 'not-configured',
    { auth: { storageKey: AUTH_STORAGE_KEY } },
);

/**
 * Signs out, and makes sure the session is gone from this device even when
 * Supabase cannot be reached. supabase.auth.signOut() returns early on a
 * network or server error *without* removing the stored session, so a reload
 * after a failed logout used to sign the previous person straight back in.
 */
export const signOutAndForget = async (): Promise<void> => {
    try {
        const { error } = await supabase.auth.signOut();
        if (!error) return;
        console.warn('[Logout] Supabase sign-out failed; removing the session from this device:', error.message);
    } catch (err) {
        console.warn('[Logout] Supabase sign-out failed; removing the session from this device:', err instanceof Error ? err.message : err);
    }
    removeStoredSession();
};

/**
 * Runs a Supabase request and reports success. PostgREST failures arrive in
 * `error`, but some failures *throw* instead (e.g. a payload that cannot be
 * serialized to JSON) — both are logged under `label` and returned as false,
 * so a failed write can never become an unhandled rejection.
 */
export const runDbWrite = async (
    label: string,
    request: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<boolean> => {
    try {
        const { error } = await request();
        if (error) {
            console.warn(`[${label}] database write failed:`, error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.warn(`[${label}] database write failed:`, err instanceof Error ? err.message : err);
        return false;
    }
};

/**
 * Like runDbWrite, for a request that ends in `.select(...)`: returns the rows
 * the database actually changed, or null if the request failed. Conditional
 * updates use this so the caller learns which students were really updated —
 * not which ones this device *thought* were eligible.
 */
export const runDbRows = async <T>(
    label: string,
    request: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[] | null> => {
    try {
        const { data, error } = await request();
        if (error) {
            console.warn(`[${label}] database write failed:`, error.message);
            return null;
        }
        return data ?? [];
    } catch (err) {
        console.warn(`[${label}] database write failed:`, err instanceof Error ? err.message : err);
        return null;
    }
};

// =============================================================================
// DATA FETCHING FUNCTIONS (Supabase v2 patterns)
// =============================================================================

/**
 * Fetches a single student with all related records for today
 */
export async function fetchStudentWithRelations(
    studentId: string,
    date: string = new Date().toISOString().split('T')[0]
): Promise<CompositeStudent | null> {
    // 1. Fetch student record
    const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

    if (studentError || !student) return null;

    // 2. Fetch today's attendance records (both programs)
    const { data: attendance } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('student_id', studentId)
        .eq('date', date);

    // 3. Fetch today's behavior logs
    const { data: behaviorLogs } = await supabase
        .from('behavior_logs')
        .select('*')
        .eq('student_id', studentId)
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`);

    // 4. Fetch today's head injury logs
    const { data: headInjuryLogs } = await supabase
        .from('head_injury_logs')
        .select('*')
        .eq('student_id', studentId)
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`);

    // 5. Compose the result
    return {
        ...student,
        sunrise_attendance: attendance?.find((a: AttendanceRecord) => a.program === 'sunrise'),
        sunset_attendance: attendance?.find((a: AttendanceRecord) => a.program === 'sunset'),
        behavior_logs_db: behaviorLogs ?? [],
        head_injury_logs_db: headInjuryLogs ?? [],
    };
}

/**
 * Fetches all students with their related records for today (batch for roster)
 */
export async function fetchAllStudentsWithRelations(
    date: string = new Date().toISOString().split('T')[0]
): Promise<CompositeStudent[]> {
    // Fetch all students
    const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .order('last_name');

    if (error || !students) return [];

    // Fetch all today's attendance
    const { data: attendance } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('date', date);

    // Fetch all today's behavior logs
    const { data: behaviorLogs } = await supabase
        .from('behavior_logs')
        .select('*')
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`);

    // Fetch all today's head injury logs
    const { data: headInjuryLogs } = await supabase
        .from('head_injury_logs')
        .select('*')
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`);

    // Map and compose
    return students.map((student: StudentRecord) => ({
        ...student,
        sunrise_attendance: attendance?.find(
            (a: AttendanceRecord) => a.student_id === student.id && a.program === 'sunrise'
        ),
        sunset_attendance: attendance?.find(
            (a: AttendanceRecord) => a.student_id === student.id && a.program === 'sunset'
        ),
        behavior_logs_db: behaviorLogs?.filter((b: BehaviorLogDB) => b.student_id === student.id) ?? [],
        head_injury_logs_db: headInjuryLogs?.filter((h: HeadInjuryLogDB) => h.student_id === student.id) ?? [],
    }));
}

// =============================================================================
// STAFF PROFILE (who is signed in)
// =============================================================================

/** Maps a public.staff row to the frontend Staff model. */
export const mapDbToStaff = (row: any): Staff => ({
    id: row.id,
    name: row.name,
    role: row.role,
    organization: row.organization || 'EDP',
    email: row.email || undefined,
    phone: row.phone || undefined,
    assignedGrades: row.assigned_grades || [],
    canCheckIn: row.can_check_in ?? true,
    canAdminTasks: row.can_admin_tasks ?? false,
    canCheckOut: row.can_check_out ?? true,
    canHir: row.can_hir ?? true,
    canWeCare: row.can_we_care ?? true,
    // Column added by migration 20261026000000; absent (so false) before it is applied.
    canViewAllReports: row.can_view_all_reports ?? false,
    hasPasskey: row.has_passkey ?? false,
});

/**
 * The staff profile for a signed-in Supabase user, in order of preference:
 *   1. their row in public.staff (id = auth user id) — name, role, permissions;
 *   2. the built-in sample staff list, matched by email (keeps demo accounts working);
 *   3. a default Assistant profile — the previous behavior for anyone else.
 *
 * Login used to consult only the sample list, so any real staff email was sent
 * to "Create your account" and could never reach the password step.
 *
 * Returns null when the lookup itself fails (network, server, permissions).
 * Callers must refuse sign-in then: falling through to the default profile
 * would hand a restricted staff member (no check-in, limited grades) an
 * unrestricted one just because the database was briefly unreachable.
 */
export const resolveStaffProfile = async (
    authUser: { id: string; email?: string | null },
    knownStaff: Staff[],
): Promise<Staff | null> => {
    try {
        const { data, error } = await supabase.from('staff').select('*').eq('id', authUser.id).limit(1);
        if (error) {
            console.warn('[Login] staff profile lookup failed:', error.message);
            return null;
        }
        if (data && data.length > 0) return mapDbToStaff(data[0]);
    } catch (err) {
        console.warn('[Login] staff profile lookup failed:', err instanceof Error ? err.message : err);
        return null;
    }

    const email = (authUser.email || '').trim().toLowerCase();
    const listed = knownStaff.find(s => (s.email || '').toLowerCase() === email);
    if (listed) return listed;

    return {
        id: authUser.id,
        name: email.split('@')[0] || 'Staff',
        role: 'Assistant',
        organization: 'EDP',
        email: authUser.email || undefined,
        canCheckIn: true,
    };
};

// =============================================================================
// DATA MAPPING FUNCTIONS (Database → Frontend models)
// =============================================================================

/**
 * Maps database student record to frontend Student model.
 *
 * Each program's attendance columns belong to the day in sunrise_date /
 * sunset_date. A program whose date is not today is shown as absent with no
 * times, so yesterday's check-ins never appear on today's roster.
 */
export const mapDbToStudent = (dbStudent: any): Student => {
    const today = localDateIso();
    const sunriseToday = dbStudent.sunrise_date === today;
    const sunsetToday = dbStudent.sunset_date === today;
    const eitherToday = sunriseToday || sunsetToday;
    return {
        id: dbStudent.id,
        firstName: dbStudent.first_name,
        lastName: dbStudent.last_name,
        grade: dbStudent.grade,
        elopId: dbStudent.elop_id || '',
        asesId: dbStudent.ases_id || '',
        guardians: dbStudent.guardians || [],
        programs: dbStudent.programs || [],
        yearbookPhotoUrl: dbStudent.yearbook_photo_url,
        sunriseStatus: (sunriseToday && dbStudent.sunrise_status) || 'absent',
        sunsetStatus: (sunsetToday && dbStudent.sunset_status) || 'absent',
        sunriseTime: sunriseToday ? dbStudent.sunrise_checkin_time : undefined,
        sunsetTime: sunsetToday ? dbStudent.sunset_checkin_time : undefined,
        sunriseCheckOutTime: sunriseToday ? dbStudent.sunrise_checkout_time : undefined,
        sunsetCheckOutTime: sunsetToday ? dbStudent.sunset_checkout_time : undefined,
        hasSnack: dbStudent.has_snack || false,
        behavior: dbStudent.behavior || 'none',
        behaviorIssues: dbStudent.behavior_issues || [],
        headInjury: dbStudent.head_injury || false,
        headInjuryLogs: dbStudent.head_injury_logs || [],
        sunriseStaff: sunriseToday ? dbStudent.sunrise_staff : undefined,
        sunsetStaff: sunsetToday ? dbStudent.sunset_staff : undefined,
        lastCheckOutBy: eitherToday ? dbStudent.last_checkout_by : undefined,
        smsSentTime: eitherToday ? dbStudent.sms_sent_time : undefined,
        checkInPhoto: dbStudent.checkin_photo,
        behaviorTimestamp: dbStudent.behavior_timestamp,
        behaviorStaff: dbStudent.behavior_staff,
        behaviorDescription: dbStudent.behavior_description,
        isCheckInBlocked: dbStudent.is_checkin_blocked || false
    };
};
