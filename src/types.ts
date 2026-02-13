// src/types.ts — All shared types for EDP Attendance App

// =============================================================================
// DATABASE-ALIGNED INTERFACES (match Supabase schema)
// =============================================================================

/**
 * StudentRecord - matches public.students table
 */
export interface StudentRecord {
    id: string;                    // uuid
    first_name: string;
    last_name: string;
    grade: string;
    parent_name: string;
    parent_phone?: string;
    parent_email?: string;
    elop_id: string;
    ases_id?: string;
    programs: string[];            // text[]
    has_snack: boolean;
    created_at: string;            // timestamp with time zone
}

/**
 * AttendanceRecord - matches public.daily_attendance table
 */
export interface AttendanceRecord {
    id: string;                    // uuid
    student_id: string;            // uuid FK → students
    date: string;                  // date (ISO format)
    program: 'sunrise' | 'sunset';
    status: 'absent' | 'present' | 'checked_out' | 'pending_parent';
    check_in_time?: string;        // time
    check_out_time?: string;       // time
    staff_id?: string;             // uuid FK → staff
    created_at: string;
}

/**
 * BehaviorLogDB - matches public.behavior_logs table
 */
export interface BehaviorLogDB {
    id: string;                    // uuid
    student_id: string;            // uuid FK → students
    level: 'green' | 'yellow' | 'red';
    issues: string[];              // text[]
    description?: string;
    staff_id?: string;             // uuid FK → staff
    created_at: string;
}

/**
 * HeadInjuryLogDB - matches public.head_injury_logs table
 */
export interface HeadInjuryLogDB {
    id: string;                    // uuid
    student_id: string;            // uuid FK → students
    stage: '0min' | '15min' | '30min';
    symptoms: Record<string, boolean>; // jsonb
    notes?: string;
    staff_id?: string;             // uuid FK → staff
    created_at: string;
}

/**
 * CompositeStudent - joins all relations for UI usage
 */
export interface CompositeStudent extends StudentRecord {
    // Joined from daily_attendance (today's records)
    sunrise_attendance?: AttendanceRecord;
    sunset_attendance?: AttendanceRecord;

    // Joined from behavior_logs (today's records)
    behavior_logs_db: BehaviorLogDB[];

    // Joined from head_injury_logs (today's records)
    head_injury_logs_db: HeadInjuryLogDB[];

    // === LOCAL-ONLY STATE (not in any DB table) ===
    guardians?: GuardianContact[];       // local: managed separately
    is_checkin_blocked?: boolean;        // local: runtime flag
    checkin_photo?: string;              // local: camera capture
    we_care_timestamp?: string;          // local: session-only
    visual_anomaly_detected?: boolean;   // local: biometric check result
    anomaly_score?: number;              // local: biometric match score
}

// =============================================================================
// FRONTEND TYPES
// =============================================================================

export type ProgramType = 'sunrise' | 'sunset';
export type AttendanceStatus = 'absent' | 'present' | 'checked_out' | 'pending_parent';
export type SubProgram = 'ELOP' | 'ASES';
export type BehaviorStatus = 'none' | 'green';

/**
 * HeadInjuryLog - frontend model for head injury tracking
 */
export interface HeadInjuryLog {
    stage: '0min' | '15min' | '30min';
    completedAt: string;
    staffName: string;
    symptoms: Record<string, boolean>;
    notes?: string;
}

/**
 * Staff - EDP staff member
 */
export interface Staff {
    id: string;
    name: string;
    role: 'Lead' | 'Assistant' | 'Coach';
    organization: 'EDP' | '549 Sports';
    email?: string;
    assignedGrades?: string[];     // e.g., ['TK', 'K']
    canCheckIn?: boolean;
    canAdminTasks?: boolean;
    canCheckOut?: boolean;
    canHir?: boolean;
    canWeCare?: boolean;
    hasPasskey?: boolean;
}

/**
 * Student - frontend model with all attendance/behavior state
 */
export interface Student {
    id: string;
    firstName: string;
    lastName: string;
    grade: string;
    guardians: GuardianContact[];
    contactLastUpdated?: string;
    yearbookPhotoUrl?: string;
    isCheckInBlocked?: boolean;
    programs: SubProgram[];
    elopId: string;
    asesId?: string;
    sunriseStatus: AttendanceStatus;
    sunriseTime?: string;
    sunriseCheckOutTime?: string;
    sunriseStaff?: string;
    sunsetStatus: AttendanceStatus;
    sunsetTime?: string;
    sunsetCheckOutTime?: string;
    sunsetStaff?: string;
    checkInPhoto?: string;
    lastCheckInPhoto?: string;     // photo from previous attendance session
    lastCheckInTimestamp?: string;
    visualAnomalyDetected?: boolean;
    anomalyScore?: number;
    attendanceCode?: string;
    pickupName?: string;
    hasSnack: boolean;
    behavior: BehaviorStatus;
    behaviorIssues: string[];
    behaviorDescription?: string;
    behaviorTimestamp?: string;
    behaviorStaff?: string;
    behaviorSubmittedAt?: number;        // Unix timestamp of original submission
    behaviorEditCount?: number;          // Number of times edited (max 1)
    behaviorLastEditedAt?: number;       // Unix timestamp of last edit
    headInjury: boolean;
    headInjuryWitness?: string;
    headInjuryWitnessDesc?: string;
    headInjuryTimestamp?: string;
    headInjuryLogs: HeadInjuryLog[];
    headInjuryStartTime?: number;
    smsSentTime?: string;
    checkInSmsSent?: boolean;
    checkInSmsTime?: string;
    lastCheckOutBy?: string;
    sunriseCheckoutBy?: string;
    sunsetCheckoutBy?: string;
    weCareTimestamp?: string;
    weCareStaff?: string;
    weCareActivity?: string;             // Activity during incident
    weCareFirstAid?: string[];           // First aid items provided
    weCareInfo?: string;                 // Additional information
    weCareSubmittedAt?: number;          // Unix timestamp of submission
    weCareEditCount?: number;            // Number of edits (max 1)
    behaviorStaffSupport?: string;
    behaviorActions?: string;
}

/**
 * GuardianContact - parent/guardian contact info
 */
export interface GuardianContact {
    type: 'Contact 1' | 'Contact 2' | 'Contact 3' | 'Contact 4' | 'Contact 5';
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    relationship?: string;
    authorizedBy?: string;
    authDate?: string;
    notifySms?: boolean;
    notifyEmail?: boolean;
}

/**
 * BiometricLog - biometric verification audit log
 */
export interface BiometricLog {
    id: string;
    studentId: string;
    studentName: string;
    timestamp: string;
    matchScore: number;
    anomalyScore: number;
    anomalyDetected: boolean;
    livePhoto: string;
    yearbookPhoto: string;
    previousPhoto: string;
}

/**
 * ParentReport - parent communication drafts and sent reports
 */
export interface ParentReport {
    id: string;
    studentId: string;
    studentName: string;
    type: 'injury' | 'behavior' | 'wecare';
    behaviorLevel?: 'green';       // only green now
    message: string;
    method: 'email' | 'sms' | 'both';
    status: 'draft' | 'sent';
    createdAt: string;
    editLogs?: string[];
    staffId: string;               // Track who filed it
}
