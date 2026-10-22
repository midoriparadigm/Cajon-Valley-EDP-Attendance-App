/// <reference types="vite/client" />
// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import type {
    StudentRecord,
    AttendanceRecord,
    BehaviorLogDB,
    HeadInjuryLogDB,
    CompositeStudent,
    Student
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

// `.invalid` is reserved (RFC 2606) and never resolves, and callers never issue
// requests when unconfigured — the placeholder only keeps createClient happy.
export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl : 'https://not-configured.invalid',
    isSupabaseConfigured ? supabaseAnonKey : 'not-configured',
);

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
