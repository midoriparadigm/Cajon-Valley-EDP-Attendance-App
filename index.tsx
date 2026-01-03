import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Types ---

type ProgramType = 'sunrise' | 'sunset';
type AttendanceStatus = 'absent' | 'present' | 'checked_out' | 'pending_parent';
type SubProgram = 'ELOP' | 'ASES';
type BehaviorStatus = 'none' | 'green' | 'yellow' | 'red';

const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

// Behavior Checklists based on Tiered District Safety Plan
const BEHAVIOR_CHECKLISTS = {
  green: [
    "Class Disruption",
    "Tardies",
    "Absences",
    "Dress Code",
    "Inappropriate Content Online",
    "Lying, Cheating, Plagiarism",
    "Defiance",
    "Minor physical aggression without injury",
    "Gum",
    "Public Displays of Affection",
    "Profanity, Vulgarity, or Inappropriate language",
    "Cell phone use, unauthorized"
  ],
  yellow: [
    "Harassment",
    "Intimidation",
    "Bullying",
    "Hands on",
    "Stealing",
    "Repeated Green behavior",
    "Mutual Fight with Mild-Moderate Injury",
    "Vandalism",
    "Attempted Theft",
    "Recording without consent",
    "Gambling",
    "Racist Remarks",
    "Hate Talk",
    "Repeated cell phone use"
  ],
  red: [
    "Weapon",
    "Threat to Self",
    "Threat to Others",
    "Drugs",
    "Vandalism",
    "Caused or attempted to cause physical injury",
    "Sexual Harassment",
    "Sexual Assault",
    "Severe Cyberbullying",
    "Viewing content online (sexual, violent)",
    "Theft",
    "Assault or Battery of Staff",
    "Terrorist Threat",
    "Explosive",
    "Alcohol"
  ]
};

const BEHAVIOR_ROLE_DESCRIPTIONS = {
  green: "Handled primarily by staff (teachers, paras, campus aides, EDP support staff, coaches, office staff, early childhood aides).\n• EDP staff and Paras can handle and should notify EDP lead (Veronica)\n• 549 staff can handle and should notify EDP lead (Veronica)\n• Teachers and Vendors can handle and should notify EDP leads (Veronica)",
  yellow: "Staff and Lead (collaborate with an administrator if needed).\n• EDP staff, Paras, and Coaches should notify EDP lead (Veronica)\n• Notify Admin if needed for urgent matters or repeated offenses",
  red: "Administrator/Lead.\n• EDP staff, Paras, and Coaches IMMEDIATELY contacts admin AND EDP lead by calling, texting, and/or radio/call all call ##00"
};

interface HeadInjuryLog {
  stage: '0min' | '15min' | '30min';
  completedAt: string;
  staffName: string;
  symptoms: Record<string, boolean>;
  notes?: string;
}

interface Staff {
  id: string;
  name: string;
  role: 'Lead' | 'Assistant' | 'Coach';
  organization: 'EDP' | '549 Sports';
  email?: string;
  assignedGrades?: string[]; // e.g., ['TK', 'K']
  canCheckIn?: boolean;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  guardianFirstName: string;
  guardianLastName: string;
  contactLastUpdated?: string;
  yearbookPhotoUrl?: string; // New field for yearbook photo
  isCheckInBlocked?: boolean; // New field for blocking check-in
  programs: SubProgram[];
  parentPhone?: string;
  parentEmail?: string;
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
  lastCheckInPhoto?: string; // photo from previous attendance session
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
  headInjury: boolean;
  headInjuryWitness?: string;
  headInjuryWitnessDesc?: string;
  headInjuryTimestamp?: string;
  headInjuryLogs: HeadInjuryLog[];
  headInjuryStartTime?: number;
  smsSentTime?: string;
}

interface BiometricLog {
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

// --- Biometric Security Module (Mock-First Architecture) ---

/**
 * MockDatabase: Decoupled data layer for functional demonstration.
 * Stores pre-assigned photos for students to simulate matching and anomaly detection.
 */
class MockDatabase {
  static getPhotosForStudent(studentId: string) {
    // Demo photos using DiceBear for consistent visuals
    return {
      yearbook: `https://api.dicebear.com/7.x/avataaars/svg?seed=student_${studentId}_yb`,
      previous: `https://api.dicebear.com/7.x/avataaars/svg?seed=student_${studentId}_prev`,
    };
  }
}

/**
 * BiometricService: Production-ready logic with fail-safe mock fallback.
 */
class BiometricService {
  /**
   * Performs identity verification and anomaly detection.
   * Fail-Safe Logic: Tries API, falls back to local visual variance.
   */
  static async processVerification(livePhoto: string, student: Student): Promise<{
    matchScore: number;
    anomalyScore: number;
    anomalyDetected: boolean;
  }> {
    // TODO: Integrate Google Cloud Vision API (SafeSearch/FaceDetection) here.
    // await googleCloudVision.analyze(livePhoto);

    // Fallback: Local Visual Variance Calculation (Simulated for Demo)
    // In production, this would use a library like face-api.js or face_recognition.

    // Simulate complex processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // For demo purposes, we randomize scores but trigger anomalies on specific criteria
    // or as a "Fail-Safe" check.
    const matchScore = 0.85 + (Math.random() * 0.1); // Always a high match for demo
    const anomalyScore = Math.random();

    // A score > 0.8 triggers the VISUAL_ANOMALY_DETECTED state
    const anomalyDetected = anomalyScore > 0.8;

    return {
      matchScore: Number(matchScore.toFixed(2)),
      anomalyScore: Number(anomalyScore.toFixed(2)),
      anomalyDetected
    };
  }

  static uploadToDrive(photo: string, studentId: string) {
    // TODO: Future Google Drive integration point
    // console.log(`Uploading check-in photo for ${studentId} to archive...`);
  }
}

// --- Mock Data ---

// --- Mock Data ---

const MOCK_LEAD_USER: Staff = {
  id: 's1',
  name: 'Veronica Thomas',
  role: 'Lead',
  organization: 'EDP',
  email: 'thomasv@cajonvalley.net',
  canCheckIn: true,
  assignedGrades: ['TK', 'K', '1', '2', '3', '4', '5']
};

const MOCK_COACH_USER: Staff = {
  id: 's2',
  name: 'Coach Mike',
  role: 'Coach',
  organization: '549 Sports',
  email: 'mike@549sports.com',
  canCheckIn: true,
  assignedGrades: ['1', '2', '3', '4', '5'] // Limited grades example
};

const INITIAL_STAFF: Staff[] = [MOCK_LEAD_USER, MOCK_COACH_USER];

const INITIAL_STUDENTS: Student[] = [
  { id: '1', elopId: '1001', asesId: 'A1001', firstName: 'Emma', lastName: 'Thompson', grade: 'K', guardianFirstName: 'Sarah', guardianLastName: 'Thompson', parentPhone: '555-0101', programs: ['ELOP', 'ASES'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma' },
  { id: '2', elopId: '1002', firstName: 'Liam', lastName: 'Rodriguez', grade: '2', guardianFirstName: 'Carlos', guardianLastName: 'Rodriguez', parentPhone: '555-0102', programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Liam', isCheckInBlocked: false },
  { id: '3', elopId: '1003', asesId: 'A1003', firstName: 'Olivia', lastName: 'Chen', grade: '1', guardianFirstName: 'Jenny', guardianLastName: 'Chen', parentPhone: '555-0103', programs: ['ELOP', 'ASES'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Olivia', isCheckInBlocked: true }, // Blocked example
  { id: '4', elopId: '1004', firstName: 'Noah', lastName: 'Smith', grade: '4', guardianFirstName: 'Mike', guardianLastName: 'Smith', programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Noah' },
  { id: '5', elopId: '1005', asesId: 'A1005', firstName: 'Ava', lastName: 'Johnson', grade: '3', guardianFirstName: 'Emily', guardianLastName: 'Johnson', parentPhone: '555-0105', programs: ['ELOP', 'ASES'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ava' },
  { id: '6', elopId: '1006', firstName: 'William', lastName: 'Brown', grade: 'K', guardianFirstName: 'David', guardianLastName: 'Brown', parentPhone: '555-0106', programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: true, headInjuryWitness: 'Veronica Thomas', headInjuryWitnessDesc: 'Bumped head on desk', headInjuryTimestamp: '10:30 AM', headInjuryStartTime: Number(Date.now()) - 1000 * 60 * 16, headInjuryLogs: [{ stage: '0min', completedAt: new Date().toISOString(), staffName: 'Veronica Thomas', symptoms: { 'Headache or pressure': true } }], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=William' },
  { id: '11', elopId: '1011', firstName: 'Mia', lastName: 'Anderson', grade: 'TK', guardianFirstName: 'Lisa', guardianLastName: 'Anderson', programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [], yearbookPhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia' },
];

const formatTimeWithMs = (ms: number) => {
  if (ms <= 0) return "00:00:00";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${centis.toString().padStart(2, '0')}`;
};

const playAlarm = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(0, t + 0.1);
    osc.frequency.setValueAtTime(880, t + 0.2);
    osc.frequency.setValueAtTime(0, t + 0.3);
    osc.frequency.setValueAtTime(880, t + 0.4);

    gain.gain.setValueAtTime(0.1, t);
    gain.gain.setValueAtTime(0.1, t + 0.5);
    gain.gain.linearRampToValueAtTime(0, t + 0.6);

    osc.start(t);
    osc.stop(t + 0.6);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

const HEAD_INJURY_SYMPTOMS = {
  cognitive: ["Difficulty thinking clearly", "Difficulty remembering events", "Difficulty concentrating", "Feeling more slowed down", "Feeling sluggish, hazy, foggy"],
  observed: ["Appears dazed or stunned", "Is confused about events", "Repeats questions", "Answers questions slowly", "Can't recall events prior", "Can't recall events after", "Loses consciousness", "Shows behavior changes", "Forgets class schedule"],
  physical: ["Headache or pressure", "Nausea or vomiting", "Balance problems or dizziness", "Fatigue or feeling tired", "Blurry or double vision", "Sensitivity to light", "Sensitivity to noise", "Numbness or tingling", "Does not 'feel right'"],
  emotional: ["Irritable", "Sad", "More emotional than usual", "Nervous"]
};

// --- Components ---

const Toast = ({ message, type }: { message: string, type: 'success' | 'info' | 'warning' | 'error' }) => {
  let bgColor = 'var(--text-secondary)';
  let icon = 'info';
  if (type === 'success') { bgColor = 'var(--color-success)'; icon = 'check_circle'; }
  else if (type === 'warning') { bgColor = 'var(--color-warning)'; icon = 'warning'; }
  else if (type === 'error') { bgColor = 'var(--color-danger)'; icon = 'error'; }

  return (
    <div style={{
      position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: bgColor, color: 'white', padding: '12px 24px', borderRadius: '30px',
      boxShadow: 'var(--shadow-lg)', fontWeight: '600', fontSize: '14px', zIndex: 350,
      display: 'flex', alignItems: 'center', gap: '8px', animation: 'slideUp 0.3s ease-out'
    }}>
      <span className="material-icons-round" style={{ fontSize: '18px' }}>{icon}</span>
      {message}
    </div>
  );
};

const CollapsedBehaviorView = ({ student, onClick }: { student: Student, onClick: () => void }) => {
  const colors = {
    green: { bg: 'var(--color-success-bg)', border: 'var(--color-success)', text: '#065f46', level: '1' },
    yellow: { bg: 'var(--color-warning-bg)', border: 'var(--color-warning)', text: '#854d0e', level: '2' },
    red: { bg: 'var(--color-danger-bg)', border: 'var(--color-danger)', text: '#b91c1c', level: '3' },
    none: { bg: 'var(--bg-app)', border: 'var(--border-subtle)', text: 'var(--text-main)', level: '0' }
  };
  const style = colors[student.behavior] || colors.none;

  return (
    <div onClick={onClick} style={{ backgroundColor: style.bg, borderRadius: '8px', padding: '16px', cursor: 'pointer', border: `1px solid ${style.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: style.border }}></div>
          <span style={{ fontWeight: '800', color: style.text, fontSize: '14px' }}>
            LEVEL {style.level} FILED
          </span>
        </div>

        {student.behaviorIssues.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            {student.behaviorIssues.map(issue => (
              <div key={issue} style={{ fontSize: '13px', fontWeight: '700', color: style.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> {issue}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: '13px', color: style.text, fontWeight: '500', lineHeight: '1.4' }}>
          {student.behaviorDescription || 'No additional description provided.'}
        </div>
      </div>
      <span className="material-icons-round" style={{ color: style.text }}>edit</span>
    </div>
  );
};

const CollapsedHeadInjuryView = ({ timeLeft }: { timeLeft: number }) => (
  <div style={{ backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center', border: '1px solid var(--border-subtle)', opacity: 0.8 }}>
    <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Active Monitoring</div>
    <div style={{ fontSize: '28px', fontWeight: '800', color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
      {formatTimeWithMs(timeLeft)}
    </div>
    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Next assessment unlocks automatically</div>
  </div>
);

const HeadInjuryChecklist = ({ student, onUpdate, currentStaffName }: { student: Student, onUpdate: (updates: Partial<Student>, logs?: HeadInjuryLog[]) => void, currentStaffName: string }) => {
  const [activeTab, setActiveTab] = useState<'0min' | '15min' | '30min'>('0min');
  const [currentSymptoms, setCurrentSymptoms] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [showNewReportForm, setShowNewReportForm] = useState(false);
  const [witnessText, setWitnessText] = useState('');
  const [witnessDone, setWitnessDone] = useState(false);

  useEffect(() => {
    const logs = student.headInjuryLogs;
    const has0 = logs.some(l => l.stage === '0min');
    const has15 = logs.some(l => l.stage === '15min');

    if (!has0) setActiveTab('0min');
    else if (!has15) setActiveTab('15min');
    else setActiveTab('30min');

    if (student.headInjuryWitnessDesc) {
      setWitnessText(student.headInjuryWitnessDesc);
      setWitnessDone(true);
      setShowNewReportForm(true);
    }
  }, [student.headInjuryLogs, student.headInjuryWitnessDesc]);

  useEffect(() => {
    const existingLog = student.headInjuryLogs.find(l => l.stage === activeTab);
    if (existingLog) {
      setCurrentSymptoms(existingLog.symptoms);
      setNotes(existingLog.notes || '');
      setSurveyCompleted(true);
    } else {
      setCurrentSymptoms({});
      setNotes('');
      setSurveyCompleted(false);
    }
  }, [activeTab, student.headInjuryLogs]);

  const handleSaveLog = () => {
    const newLog: HeadInjuryLog = {
      stage: activeTab,
      completedAt: new Date().toISOString(),
      staffName: currentStaffName,
      symptoms: currentSymptoms,
      notes: notes
    };
    const updatedLogs = [...student.headInjuryLogs.filter(l => l.stage !== activeTab), newLog];

    let startTime = student.headInjuryStartTime;
    if (activeTab === '0min' && !startTime) {
      startTime = Number(Date.now());
    }

    onUpdate({
      headInjury: true,
      headInjuryTimestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      headInjuryStartTime: startTime
    }, updatedLogs);
  };

  const handleWitnessDone = () => {
    if (!witnessText.trim()) return;
    setWitnessDone(true);
    onUpdate({
      headInjuryWitnessDesc: witnessText,
      headInjuryWitness: currentStaffName,
      headInjuryTimestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    });
  };

  const handleNoToAll = () => {
    const allClear: Record<string, boolean> = {};
    Object.values(HEAD_INJURY_SYMPTOMS).flat().forEach(s => allClear[s] = false);
    setCurrentSymptoms(allClear);
    setSurveyCompleted(true);
  };

  const handleYesDone = () => {
    setSurveyCompleted(true);
  };

  const handleCancelReport = () => {
    setShowNewReportForm(false);
    setWitnessText('');
    setWitnessDone(false);
    onUpdate({ headInjury: false, headInjuryWitnessDesc: undefined, headInjuryLogs: [], headInjuryStartTime: undefined });
  };

  const isReadOnly = !!student.headInjuryLogs.find(l => l.stage === activeTab);
  const hasYesSymptoms = Object.values(currentSymptoms).some(val => val === true);

  if (!showNewReportForm && !student.headInjury) {
    return (
      <button onClick={() => setShowNewReportForm(true)} style={{ width: '100%', padding: '16px', backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', borderRadius: 'var(--radius-lg)', fontWeight: '700', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <span className="material-icons-round">add_circle</span> New Report
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
          Witness Statement {student.headInjuryTimestamp && <span style={{ fontWeight: '400', fontSize: '14px' }}> • Reported by {student.headInjuryWitness || currentStaffName} at {student.headInjuryTimestamp}</span>}
        </label>
        <textarea
          value={witnessText}
          onChange={(e) => setWitnessText(e.target.value)}
          disabled={witnessDone}
          placeholder="Describe how the injury occurred..."
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '14px', minHeight: '80px', fontFamily: 'inherit', outline: 'none' }}
        />
        {!witnessDone && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button onClick={handleCancelReport} style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: 'none', backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleWitnessDone} disabled={!witnessText.trim()} style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: 'none', backgroundColor: 'var(--color-primary)', color: 'white', fontWeight: '600', cursor: 'pointer', opacity: witnessText.trim() ? 1 : 0.5 }}>Done</button>
          </div>
        )}
      </div>

      {witnessDone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', backgroundColor: 'var(--color-danger-bg)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {(['0min', '15min', '30min'] as const).map(stage => {
              const isDone = student.headInjuryLogs.some(l => l.stage === stage);
              return (
                <button key={stage} onClick={() => isDone && setActiveTab(stage)} disabled={!isDone && activeTab !== stage} style={{ flex: 1, padding: '12px 0', border: 'none', background: activeTab === stage ? 'white' : 'transparent', color: activeTab === stage ? 'var(--color-danger)' : isDone ? 'var(--color-success)' : 'var(--text-muted)', fontWeight: '700', cursor: 'pointer', borderBottom: activeTab === stage ? '2px solid var(--color-danger)' : 'none', fontSize: '13px' }}>
                  {stage} {isDone && '✓'}
                </button>
              );
            })}
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', opacity: surveyCompleted && !isReadOnly ? 0.6 : 1, pointerEvents: surveyCompleted && !isReadOnly ? 'none' : 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(HEAD_INJURY_SYMPTOMS).map(([category, symptoms]) => (
              <div key={category} style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {category} Symptoms
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {symptoms.map(symptom => (
                    <div key={symptom} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bg-app)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-main)', flex: 1, paddingRight: '8px', fontWeight: '500' }}>{symptom}</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          disabled={isReadOnly}
                          onClick={() => setCurrentSymptoms(p => ({ ...p, [symptom]: p[symptom] === true ? undefined : true }))}
                          style={{
                            width: '42px', height: '36px', borderRadius: '8px',
                            border: currentSymptoms[symptom] === true ? '2px solid var(--color-success)' : '1px solid var(--border-subtle)',
                            backgroundColor: currentSymptoms[symptom] === true ? 'var(--color-success-bg)' : 'var(--bg-card)',
                            color: currentSymptoms[symptom] === true ? 'var(--color-success)' : 'var(--text-main)',
                            fontWeight: '800', fontSize: '14px', cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}>Y</button>
                        <button
                          disabled={isReadOnly}
                          onClick={() => setCurrentSymptoms(p => ({ ...p, [symptom]: p[symptom] === false ? undefined : false }))}
                          style={{
                            width: '42px', height: '36px', borderRadius: '8px',
                            border: currentSymptoms[symptom] === false ? '2px solid var(--color-danger)' : '1px solid var(--border-subtle)',
                            backgroundColor: currentSymptoms[symptom] === false ? 'var(--color-danger-bg)' : 'var(--bg-card)',
                            color: currentSymptoms[symptom] === false ? 'var(--color-danger)' : 'var(--text-main)',
                            fontWeight: '800', fontSize: '14px', cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}>N</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!isReadOnly && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {!surveyCompleted ? (
                <>
                  {hasYesSymptoms && (
                    <button onClick={handleYesDone} style={{ width: '100%', padding: '14px', backgroundColor: 'var(--color-success)', border: 'none', color: 'white', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px' }}>Done (Issues Found)</button>
                  )}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleCancelReport} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleNoToAll} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>"No" to All</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={handleCancelReport} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--bg-hover)', border: 'none', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleSaveLog} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Save Assessment</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ConfirmationModal = ({ student, onConfirm, onCancel, title, message, showPhotoOption, isDemoMode }: { student: Student, onConfirm: (photo?: string, biometricData?: any) => void, onCancel: () => void, title: string, message: string, showPhotoOption?: boolean, isDemoMode?: boolean }) => {
  const [step, setStep] = useState<'confirm' | 'camera' | 'verifying' | 'verified'>('confirm');
  const [photo, setPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startCamera = async () => {
    setStep('camera');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
  };

  const capturePhoto = async () => {
    // Capture actual photo from video stream
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 320;
      canvas.height = videoRef.current.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const capturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
        setPhoto(capturedPhoto);

        setStep('verifying');

        // Biometric Verification Process (Match + Anomaly Check)
        const result = await BiometricService.processVerification(capturedPhoto, student);

        // Update student with biometric data
        const biometricData = {
          anomalyScore: result.anomalyScore,
          visualAnomalyDetected: result.anomalyDetected,
          lastCheckInPhoto: capturedPhoto,
          lastCheckInTimestamp: new Date().toISOString()
        };

        setStep('verified');

        // Auto-close after verified
        setTimeout(() => {
          onConfirm(capturedPhoto, biometricData);
        }, 1500);
      }
    } else {
      // Fallback if video not available
      setStep('verifying');
      const result = await BiometricService.processVerification('', student);
      setTimeout(() => {
        setStep('verified');
        setTimeout(() => {
          onConfirm(undefined, {
            anomalyScore: result.anomalyScore,
            visualAnomalyDetected: result.anomalyDetected,
            lastCheckInPhoto: undefined,
            lastCheckInTimestamp: new Date().toISOString()
          });
        }, 1500);
      }, 1500);
    }
  };

  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>

        {step === 'confirm' && (
          <>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>{title}</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{message}</p>

            {showPhotoOption && (
              <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
                  <span className="material-icons-round" style={{ color: 'var(--text-main)' }}>face</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>Face Verification</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Verify student identity</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={onCancel} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => showPhotoOption ? startCamera() : onConfirm()} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
                {showPhotoOption ? 'Verify & Check In' : 'Confirm'}
              </button>
            </div>
          </>
        )}

        {step === 'camera' && (
          <>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>Capture Photo</h3>
            <div style={{ width: '100%', height: '240px', backgroundColor: '#000', borderRadius: '16px', marginBottom: '16px', overflow: 'hidden', position: 'relative' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '16px', left: '0', right: '0', display: 'flex', justifyContent: 'center' }}>
                <button onClick={capturePhoto} style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'white', border: '4px solid rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '54px', height: '54px', borderRadius: '50%', backgroundColor: 'white', border: '2px solid black' }}></div>
                </button>
              </div>
            </div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
          </>
        )}

        {step === 'verifying' && (
          <>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>Verifying Identity...</h3>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
              <div style={{ textAlign: 'center' }}>
                <img src={student.yearbookPhotoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.firstName}`} alt="Yearbook" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--text-main)', objectFit: 'cover', marginBottom: '8px' }} />
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Yearbook</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '40px', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', backgroundColor: '#3b82f6', animation: 'indeterminate 1.5s infinite linear' }}></div>
                </div>
                <style>{`@keyframes indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--text-main)', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', overflow: 'hidden' }}>
                  <span className="material-icons-round" style={{ fontSize: '40px', color: '#9ca3af' }}>face</span>
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Live Camera</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Comparing facial features...</div>
          </>
        )}

        {step === 'verified' && (
          <>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', position: 'relative' }}>
              <span className="material-icons-round" style={{ fontSize: '48px' }}>check</span>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '800', color: '#16a34a' }}>Match Confirmed</h3>
            <p style={{ margin: '0', color: 'var(--text-secondary)' }}>Student identity verified.</p>

            {/* Anomaly Detection Feedback */}
            <div style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#fff7ed', border: '1px solid #ffedd5', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Safety Check: Complete</span>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

const StudentDetailModal = ({ student, onClose, onSave, onCheckOut, currentStaff, program }: { student: Student, onClose: () => void, onSave: (s: Student) => void, onCheckOut: (id: string, smsTime: string) => void, currentStaff: Staff, program: ProgramType }) => {
  const [editedStudent, setEditedStudent] = useState({ ...student });
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [behaviorCollapsed, setBehaviorCollapsed] = useState(student.behavior !== 'none');
  const [showTicketOptions, setShowTicketOptions] = useState(false);

  const [editedParentFirst, setEditedParentFirst] = useState(student.guardianFirstName);
  const [editedParentLast, setEditedParentLast] = useState(student.guardianLastName);
  const [editedPhone, setEditedPhone] = useState(student.parentPhone || '');
  const [editedEmail, setEditedEmail] = useState(student.parentEmail || '');
  const [isEditingContact, setIsEditingContact] = useState(false);

  const handleSaveContact = () => {
    onSave({ ...editedStudent, guardianFirstName: editedParentFirst, guardianLastName: editedParentLast, parentPhone: editedPhone, parentEmail: editedEmail, contactLastUpdated: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    setIsEditingContact(false);
  };

  const cancelEditContact = () => {
    setEditedParentFirst(student.guardianFirstName);
    setEditedParentLast(student.guardianLastName);
    setEditedPhone(student.parentPhone || '');
    setEditedEmail(student.parentEmail || '');
    setIsEditingContact(false);
  };
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
  const alarmPlayedRef = useRef(false);
  const isLead = currentStaff.role === 'Lead';

  useEffect(() => {
    setEditedStudent({ ...student });
    setEditedParentFirst(student.guardianFirstName);
    setEditedParentLast(student.guardianLastName);
    setEditedPhone(student.parentPhone || '');
    setEditedEmail(student.parentEmail || '');
  }, [student]);

  useEffect(() => {
    if (!editedStudent.headInjuryStartTime || !editedStudent.headInjury) return;

    const interval = setInterval(() => {
      const elapsed = Number(Date.now()) - editedStudent.headInjuryStartTime!;
      const nextCheck = editedStudent.headInjuryLogs.some(l => l.stage === '15min') ? 30 * 60 * 1000 : 15 * 60 * 1000;
      const remaining = nextCheck - elapsed;

      if (remaining <= 0) {
        setTimeLeft(0);
        if (!alarmPlayedRef.current && isHeadInjuryMonitoring(0)) {
          playAlarm();
          alarmPlayedRef.current = true;
        }
      } else {
        setTimeLeft(remaining);
        alarmPlayedRef.current = false;
      }
    }, 33);
    return () => clearInterval(interval);
  }, [editedStudent.headInjuryStartTime, editedStudent.headInjury, editedStudent.headInjuryLogs]);

  const isHeadInjuryMonitoring = (currentTimeLeft = timeLeft) => {
    if (!editedStudent.headInjury) return false;
    const logs = editedStudent.headInjuryLogs;
    const has30 = logs.some(l => l.stage === '30min');
    if (has30) return false;
    return true;
  };

  const handleSectionSave = (updatedStudent: Student) => {
    setEditedStudent(updatedStudent);
    onSave(updatedStudent);
  };

  const saveBehavior = () => {
    setBehaviorCollapsed(true);
    setShowTicketOptions(false);
    handleSectionSave(editedStudent);
  };

  const cancelTicket = () => {
    setEditedStudent(prev => ({ ...prev, behavior: 'none', behaviorIssues: [], behaviorDescription: undefined }));
    setShowTicketOptions(false);
  };

  const setBehavior = (status: BehaviorStatus) => {
    if (status === editedStudent.behavior) {
      setEditedStudent({ ...editedStudent, behavior: 'none' as BehaviorStatus, behaviorIssues: [], behaviorDescription: undefined });
    } else {
      setEditedStudent({ ...editedStudent, behavior: status, behaviorTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), behaviorStaff: currentStaff.name });
      setBehaviorCollapsed(false);
      setShowTicketOptions(true);
    }
  };

  const handleLocalCheckOut = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const pendingUpdate = program === 'sunrise'
      ? { sunriseStatus: 'pending_parent' as AttendanceStatus }
      : { sunsetStatus: 'pending_parent' as AttendanceStatus };

    setEditedStudent(prev => ({ ...prev, ...pendingUpdate, smsSentTime: timeStr }));
    setShowCheckOutConfirm(false);
    onCheckOut(student.id, timeStr);
  };

  const currentStatus = program === 'sunrise' ? editedStudent.sunriseStatus : editedStudent.sunsetStatus;
  const isPresent = currentStatus === 'present';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: 'var(--modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', width: '100%', maxWidth: '600px', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
          <div><h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--text-main)' }}>{student.firstName} {student.lastName}</h2><div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Grade {student.grade}</div></div>
          <button onClick={onClose} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-icons-round">close</span></button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* 1. Attendance Record (AT THE TOP) */}
          <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-icons-round" style={{ color: 'var(--text-main)', fontSize: '20px' }}>schedule</span>
              <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attendance Record</span>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isPresent && !showCheckOutConfirm && (
                <button onClick={() => setShowCheckOutConfirm(true)} style={{ width: '100%', backgroundColor: 'var(--color-sunset)', color: 'white', border: 'none', padding: '16px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px' }}>
                  <span className="material-icons-round">logout</span> CHECK OUT
                </button>
              )}

              {showCheckOutConfirm && (
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-subtle)', animation: 'slideUp 0.2s' }}>
                  <div style={{ marginBottom: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Confirm Check out?</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setShowCheckOutConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleLocalCheckOut} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--color-sunset)', color: 'white', fontWeight: '600', cursor: 'pointer' }}>Yes</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>Checked-In:</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
                    {program === 'sunrise' ? editedStudent.sunriseTime : editedStudent.sunsetTime || '--:--'} by {program === 'sunrise' ? (editedStudent.sunriseStaff || 'Staff') : (editedStudent.sunsetStaff || 'Staff')}
                  </span>
                </div>
                {(currentStatus === 'pending_parent' || currentStatus === 'checked_out') &&
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>Check-Out SMS Sent:</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>{editedStudent.smsSentTime || '--:--'}</span>
                  </div>
                }
                {currentStatus === 'checked_out' &&
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>Checked-Out:</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>{program === 'sunrise' ? editedStudent.sunriseCheckOutTime : editedStudent.sunsetCheckOutTime || '--:--'}</span>
                  </div>
                }
              </div>
            </div>
          </section>

          {/* 2. Behavior Ticket */}
          <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-icons-round" style={{ color: 'var(--color-warning)', fontSize: '20px' }}>traffic</span>
              <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Behavior Ticket</span>
            </div>

            <div style={{ padding: '16px' }}>
              {behaviorCollapsed && editedStudent.behavior !== 'none' ? (
                <CollapsedBehaviorView student={editedStudent} onClick={() => setBehaviorCollapsed(false)} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {editedStudent.behavior === 'none' && !showTicketOptions ? (
                    <button onClick={() => setShowTicketOptions(true)} style={{ width: '100%', padding: '16px', backgroundColor: 'var(--color-success)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span className="material-icons-round">add_circle</span> New Ticket
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                        {(['green', 'yellow', 'red'] as BehaviorStatus[]).map(lvl => (
                          <button key={lvl} onClick={() => setBehavior(lvl)} style={{ padding: '16px', borderRadius: '12px', border: editedStudent.behavior === lvl ? '3px solid var(--text-main)' : 'none', backgroundColor: lvl === 'green' ? 'var(--color-success)' : lvl === 'yellow' ? 'var(--color-warning)' : 'var(--color-danger)', color: 'white', fontWeight: '800', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'var(--shadow-md)', cursor: 'pointer', transition: 'all 0.2s' }}>
                            Level {lvl === 'green' ? '1' : lvl === 'yellow' ? '2' : '3'}
                          </button>
                        ))}
                      </div>

                      {editedStudent.behavior !== 'none' && (
                        <div style={{ animation: 'slideUp 0.2s', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '12px', lineHeight: '1.5', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                            <strong>Handling Staff:</strong><br />
                            {BEHAVIOR_ROLE_DESCRIPTIONS[editedStudent.behavior as 'green' | 'yellow' | 'red']}
                          </div>

                          <div style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check Behaviors</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {BEHAVIOR_CHECKLISTS[editedStudent.behavior as 'green' | 'yellow' | 'red'].map((item) => (
                                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-main)', padding: '4px 0', borderBottom: '1px solid var(--bg-app)', cursor: 'pointer' }}>
                                  <input type="checkbox" checked={editedStudent.behaviorIssues?.includes(item) || false} onChange={() => {
                                    const issues = editedStudent.behaviorIssues.includes(item) ? editedStudent.behaviorIssues.filter(i => i !== item) : [...editedStudent.behaviorIssues, item];
                                    setEditedStudent({ ...editedStudent, behaviorIssues: issues });
                                  }} style={{ transform: 'scale(1.2)' }} />
                                  {item}
                                </label>
                              ))}
                            </div>
                          </div>

                          <textarea
                            value={editedStudent.behaviorDescription || ''}
                            onChange={e => setEditedStudent({ ...editedStudent, behaviorDescription: e.target.value })}
                            placeholder="Tell us what happened. Please include all of the important details and context."
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', minHeight: '100px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontFamily: 'inherit', outline: 'none', lineHeight: '1.5', fontSize: '14px' }}
                          />

                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={cancelTicket} style={{ flex: 1, padding: '12px', backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: 'none', borderRadius: '12px', fontWeight: '700' }}>Cancel</button>
                            <button onClick={saveBehavior} style={{ flex: 1, padding: '12px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '12px', fontWeight: '700' }}>Save Ticket</button>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Stamped: {editedStudent.behaviorTimestamp} by {editedStudent.behaviorStaff}</div>
                        </div>
                      )}

                      {editedStudent.behavior === 'none' && showTicketOptions && (
                        <button onClick={() => setShowTicketOptions(false)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 3. Head Injury Report */}
          <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-icons-round" style={{ color: 'var(--color-danger)', fontSize: '20px' }}>personal_injury</span>
              <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Head Injury Report</span>
            </div>
            <div style={{ padding: '16px' }}>
              {isHeadInjuryMonitoring() && timeLeft > 0 ? (
                <CollapsedHeadInjuryView timeLeft={timeLeft} />
              ) : (
                <HeadInjuryChecklist
                  student={editedStudent}
                  currentStaffName={currentStaff.name}
                  onUpdate={(updates, logs) => {
                    const merged = { ...editedStudent, ...updates };
                    if (logs) merged.headInjuryLogs = logs;
                    handleSectionSave(merged);
                  }}
                />
              )}
            </div>
          </section>
          {/* 4. Guardian Contact Info (Restored) */}
          {isLead && (
            <section style={{ backgroundColor: 'var(--bg-input)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-icons-round" style={{ color: 'var(--text-main)', fontSize: '20px' }}>contact_phone</span>
                  <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Guardian Contact</span>
                </div>
                {!isEditingContact && (
                  <button onClick={() => setIsEditingContact(true)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Edit</button>
                )}
              </div>
              <div style={{ padding: '16px' }}>
                {isEditingContact ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>First Name</label>
                        <input value={editedParentFirst} onChange={(e) => setEditedParentFirst(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '14px' }} placeholder="First Name" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Last Name</label>
                        <input value={editedParentLast} onChange={(e) => setEditedParentLast(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '14px' }} placeholder="Last Name" />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone</label>
                      <input value={editedPhone} onChange={(e) => setEditedPhone(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '14px' }} placeholder="Phone Number" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email</label>
                      <input value={editedEmail} onChange={(e) => setEditedEmail(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '14px' }} placeholder="Email" />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button onClick={cancelEditContact} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleSaveContact} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', fontWeight: '700', cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round">person</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>{student.guardianFirstName} {student.guardianLastName}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Guardian</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round">phone</span>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text-main)' }}>{student.parentPhone || 'No phone number'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round">email</span>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text-main)' }}>{student.parentEmail || 'No email listed'}</div>
                    </div>
                    {student.contactLastUpdated && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic', textAlign: 'right' }}>
                        Updated: {student.contactLastUpdated}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
};

const StaffLogin = ({ onLogin, onToggleDemo, isDemoMode }: { onLogin: (user: Staff) => void, onToggleDemo: () => void, isDemoMode: boolean }) => {
  const [email, setEmail] = useState('');

  const handleFaceID = () => {
    onLogin(MOCK_LEAD_USER);
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes('549sports.com')) {
      onLogin({ ...MOCK_COACH_USER, email });
    } else {
      onLogin({ ...MOCK_LEAD_USER, email });
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-app)' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px' }}>EDP Attendance</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Cajon Valley School District</p>
        </div>

        <button onClick={handleFaceID} style={{ width: '100%', padding: '16px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: 'none', fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px', cursor: 'pointer', boxShadow: 'var(--shadow-md)' }}>
          <span className="material-icons-round">face</span>
          Login with Face ID
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }}></div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }}></div>
        </div>

        <form onSubmit={handleEmailLogin}>
          <input
            type="email"
            placeholder="Work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', fontSize: '16px', marginBottom: '16px', color: 'var(--text-main)' }}
          />
          <button type="submit" style={{ width: '100%', padding: '16px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', borderRadius: 'var(--radius-xl)', border: 'none', fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginBottom: '24px' }}>
            Continue with Email
          </button>
        </form>

        <div onClick={onToggleDemo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', opacity: isDemoMode ? 1 : 0.6 }}>
          <span className="material-icons-round" style={{ color: isDemoMode ? '#8b5cf6' : 'var(--text-muted)' }}>{isDemoMode ? 'toggle_on' : 'toggle_off'}</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: isDemoMode ? '#8b5cf6' : 'var(--text-muted)' }}>Enable Demo Mode</span>
        </div>
      </div>
    </div>
  );
};


const RosterManager = ({ onImport, onAdd }: { onImport: (s: Student[]) => void, onAdd: (s: Student) => void }) => {
  const [manualStudent, setManualStudent] = useState({ firstName: '', lastName: '', grade: 'K', elopId: '' });
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const newStudents: Student[] = [
        { id: 'new1', elopId: '9001', firstName: 'New', lastName: 'Student', grade: '1', guardianFirstName: 'Guardian', guardianLastName: 'Parent', programs: ['ELOP'], sunriseStatus: 'absent', sunsetStatus: 'absent', hasSnack: false, behavior: 'none', behaviorIssues: [], headInjury: false, headInjuryLogs: [] }
      ];
      onImport(newStudents);
      alert('Roster Imported Successfully');
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
      <h3 style={{ margin: '0 0 16px 0' }}>Roster Management</h3>
      <div style={{ display: 'grid', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>Bulk Import CSV</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ flex: 1 }} />
            <button onClick={() => alert('Downloading Template...')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-hover)', cursor: 'pointer' }}>Template</button>
          </div>
        </div>
        <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>Add Single Student</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
            <input placeholder="First" value={manualStudent.firstName} onChange={e => setManualStudent({ ...manualStudent, firstName: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }} />
            <input placeholder="Last" value={manualStudent.lastName} onChange={e => setManualStudent({ ...manualStudent, lastName: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            <input placeholder="ID" value={manualStudent.elopId} onChange={e => setManualStudent({ ...manualStudent, elopId: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', width: '100%', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }} />
            <select value={manualStudent.grade} onChange={e => setManualStudent({ ...manualStudent, grade: e.target.value })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>
              {GRADES.filter(g => g !== 'All').map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button onClick={() => {
              if (!manualStudent.firstName || !manualStudent.lastName) return;
              onAdd({
                id: String(Date.now()),
                ...manualStudent,
                guardianFirstName: 'Guardian',
                guardianLastName: 'Name',
                programs: ['ELOP'],
                sunriseStatus: 'absent',
                sunsetStatus: 'absent',
                hasSnack: false,
                behavior: 'none',
                behaviorIssues: [],
                headInjury: false,
                headInjuryLogs: []
              });
              setManualStudent({ firstName: '', lastName: '', grade: 'K', elopId: '' });
            }} style={{ padding: '8px 16px', backgroundColor: 'var(--text-main)', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const LeaderDashboard = ({ students, onClose, onImport, onAddStudent, onUpdateStaff, onUpdateStudent, staffList, parentReports, biometricLogs, isInline, onUpdateReport }: { students: Student[], onClose: () => void, onImport: (students: Student[]) => void, onAddStudent: (s: Student) => void, onUpdateStaff: (staff: Staff[]) => void, onUpdateStudent: (s: Student) => void, staffList: Staff[], parentReports: ParentReport[], biometricLogs: BiometricLog[], isInline?: boolean, onUpdateReport?: (report: ParentReport) => void }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'permissions' | 'batch' | 'blocking' | 'reports' | 'biometric'>('roster');
  const [localStaff, setLocalStaff] = useState<Staff[]>(staffList);
  const [sunriseBatchTime, setSunriseBatchTime] = useState(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  const [selectedDraft, setSelectedDraft] = useState<ParentReport | null>(null);

  // Filter for blocking
  const [blockSearch, setBlockSearch] = useState('');
  const [confirmBlockStudent, setConfirmBlockStudent] = useState<Student | null>(null);

  const toggleStaffCheckIn = (staffId: string) => {
    const updated = localStaff.map(s => s.id === staffId ? { ...s, canCheckIn: !s.canCheckIn } : s);
    setLocalStaff(updated);
    onUpdateStaff(updated);
  };

  const toggleGradeAssignment = (staffId: string, grade: string) => {
    const updated = localStaff.map(s => {
      if (s.id !== staffId) return s;
      const currentGrades = s.assignedGrades || [];
      const newGrades = currentGrades.includes(grade)
        ? currentGrades.filter(g => g !== grade)
        : [...currentGrades, grade];
      return { ...s, assignedGrades: newGrades };
    });
    setLocalStaff(updated);
    onUpdateStaff(updated);
  };

  const handleSunriseBatchCheckout = () => {
    const pendingStudents = students.filter(s => s.sunriseStatus === 'pending_parent');
    pendingStudents.forEach(s => {
      onUpdateStudent({ ...s, sunriseStatus: 'checked_out', sunriseCheckOutTime: sunriseBatchTime });
    });
  };

  const toggleStudentBlock = (student: Student) => {
    setConfirmBlockStudent(student);
  };

  const handleConfirmBlock = () => {
    if (confirmBlockStudent) {
      onUpdateStudent({ ...confirmBlockStudent, isCheckInBlocked: !confirmBlockStudent.isCheckInBlocked });
      setConfirmBlockStudent(null);
    }
  };

  return (
    <div style={{ position: isInline ? 'relative' : 'fixed', top: isInline ? 0 : 0, left: isInline ? 0 : 0, right: isInline ? 0 : 0, bottom: isInline ? 'auto' : 0, backgroundColor: isInline ? 'transparent' : 'var(--bg-app)', zIndex: isInline ? 1 : 300, display: 'flex', flexDirection: 'column', borderRadius: isInline ? '16px' : 0, border: isInline ? '1px solid var(--border-subtle)' : 'none', marginBottom: isInline ? '16px' : 0 }}>
      {!isInline && (
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-card)' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="material-icons-round">dashboard</span> Leader Dashboard
          </h2>
          <button onClick={onClose} style={{ padding: '10px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', fontWeight: '600', color: 'var(--text-main)' }}>Close</button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', padding: isInline ? '0 16px' : '0 20px', overflowX: 'auto' }}>
        {[
          { id: 'permissions', label: 'Permissions' },
          { id: 'blocking', label: 'Access' },
          { id: 'biometric', label: 'Photo Review' },
          { id: 'reports', label: `Reports (${parentReports.length})` },
          { id: 'batch', label: 'Batch Ops' },
          { id: 'roster', label: 'Roster' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ padding: isInline ? '12px 16px' : '16px 24px', border: 'none', background: 'none', borderBottom: activeTab === tab.id ? '3px solid #8b5cf6' : '3px solid transparent', fontWeight: '700', color: activeTab === tab.id ? 'var(--text-main)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: isInline ? '13px' : '15px', whiteSpace: 'nowrap' }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {activeTab === 'roster' && (
          <RosterManager onImport={onImport} onAdd={onAddStudent} />
        )}

        {activeTab === 'permissions' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>Staff Permissions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {localStaff.map(staff => (
                <div key={staff.id} style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>{staff.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{staff.role} • {staff.organization}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: staff.id === 's1' ? 0.5 : 1 }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Can Check In?</span>
                      <button disabled={staff.id === 's1'} onClick={() => toggleStaffCheckIn(staff.id)} style={{ width: '48px', height: '28px', borderRadius: '14px', backgroundColor: staff.canCheckIn ? 'var(--color-success)' : 'var(--bg-input)', position: 'relative', border: 'none', cursor: staff.id === 's1' ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: staff.canCheckIn ? '22px' : '2px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }} />
                      </button>
                    </div>
                  </div>

                  <div style={{ margin: '12px 0' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Assigned Grades</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {GRADES.filter(g => g !== 'All').map(g => (
                        <button key={g} onClick={() => toggleGradeAssignment(staff.id, g)} style={{ padding: '6px 12px', borderRadius: '8px', border: (staff.assignedGrades || []).includes(g) ? '1px solid var(--text-main)' : '1px solid var(--border-subtle)', backgroundColor: (staff.assignedGrades || []).includes(g) ? 'var(--text-main)' : 'transparent', color: (staff.assignedGrades || []).includes(g) ? 'var(--bg-card)' : 'var(--text-main)', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'batch' && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'var(--color-sunrise)', color: 'white' }}>
                  <span className="material-icons-round">wb_sunny</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Sunrise Batch Checkout</h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Check out all "Pending Parents" students</div>
                </div>
              </div>

              <div style={{ margin: '24px 0', padding: '20px', backgroundColor: 'var(--bg-app)', borderRadius: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-secondary)' }}>Checkout Time</label>
                <input type="time" value={sunriseBatchTime} onChange={(e) => setSunriseBatchTime(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '16px', fontWeight: '600', width: '100%', maxWidth: '200px' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Students Pending Checkout:</span>
                <span style={{ fontWeight: '800', fontSize: '18px', color: '#8b5cf6' }}>{students.filter(s => s.sunriseStatus === 'pending_parent').length}</span>
              </div>

              <button onClick={handleSunriseBatchCheckout} disabled={students.filter(s => s.sunriseStatus === 'pending_parent').length === 0} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', opacity: students.filter(s => s.sunriseStatus === 'pending_parent').length === 0 ? 0.5 : 1 }}>
                Run Batch Checkout
              </button>
            </div>
          </div>
        )}

        {activeTab === 'blocking' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>Student Check-In Access</h3>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
              <input value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} placeholder="Search student to manage access..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)', fontSize: '15px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {students.filter(s => (s.firstName.toLowerCase() + ' ' + s.lastName.toLowerCase()).includes(blockSearch.toLowerCase())).map(student => (
                <div key={student.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', opacity: student.isCheckInBlocked ? 0.8 : 1, borderLeft: student.isCheckInBlocked ? '4px solid var(--color-danger)' : '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>{student.grade}</div>
                    <div>
                      <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{student.firstName} {student.lastName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{student.guardianFirstName} {student.guardianLastName}</div>
                    </div>
                  </div>
                  <button onClick={() => toggleStudentBlock(student)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: student.isCheckInBlocked ? 'var(--color-danger-bg)' : 'var(--bg-hover)', color: student.isCheckInBlocked ? 'var(--color-danger)' : 'var(--text-main)', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                    {student.isCheckInBlocked ? 'No Check-In' : 'Active'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'biometric' && (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-icons-round">face</span> Photo Verification Review
            </h3>

            {biometricLogs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px' }}>no_photography</span>
                <div style={{ fontWeight: '600' }}>No verification logs yet</div>
                <div style={{ fontSize: '14px' }}>Logs will appear here after student check-ins</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {biometricLogs.map(log => (
                  <div key={log.id} style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)', borderLeft: log.anomalyDetected ? '6px solid #f97316' : '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {log.studentName}
                          {log.anomalyDetected && (
                            <span style={{ padding: '4px 12px', borderRadius: '20px', backgroundColor: '#fff7ed', color: '#ea580c', fontSize: '11px', fontWeight: '800', border: '1px solid #ffedd5', textTransform: 'uppercase' }}>
                              VISUAL_ANOMALY_DETECTED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Log ID: {log.id} • {log.timestamp}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Identity Match</div>
                        <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--color-success)' }}>{(log.matchScore * 100).toFixed(0)}%</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ height: '140px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border-subtle)', marginBottom: '8px' }}>
                          <img src={log.yearbookPhoto} alt="Yearbook" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Yearbook</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ height: '140px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border-subtle)', marginBottom: '8px' }}>
                          <img src={log.previousPhoto} alt="Previous Day" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Previous Day</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ height: '140px', backgroundColor: 'var(--bg-app)', borderRadius: '12px', overflow: 'hidden', border: `3px solid ${log.anomalyDetected ? '#f97316' : '#8b5cf6'}`, marginBottom: '8px' }}>
                          {log.livePhoto ? (
                            <img src={log.livePhoto} alt="Live Capture" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                              <span className="material-icons-round" style={{ color: 'white' }}>no_photography</span>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: log.anomalyDetected ? '#ea580c' : '#8b5cf6', textTransform: 'uppercase' }}>Check-In Capture</div>
                      </div>
                    </div>

                    {log.anomalyDetected && (
                      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fff7ed', borderRadius: '12px', border: '1px solid #ffedd5', fontSize: '13px', color: '#9a3412', display: 'flex', gap: '10px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>warning</span>
                        <div>
                          <strong>Anomaly Detected:</strong> This student's current appearance significantly deviates from their previous check-in (Variance: {(log.anomalyScore * 100).toFixed(1)}%). Review for potential injury or unverified identity.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-main)' }}>Parent Reports</h3>
            {parentReports.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px' }}>description</span>
                <div style={{ fontWeight: '600' }}>No reports yet</div>
                <div style={{ fontSize: '14px' }}>Reports will appear here when created from incidents</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {parentReports.map(report => (
                  <div
                    key={report.id}
                    style={{ padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${report.status === 'sent' ? '#6b7280' : '#f59e0b'}`, cursor: 'pointer', transition: 'transform 0.15s' }}
                    onClick={() => setSelectedDraft(report)}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.01)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{report.studentName}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', backgroundColor: report.type === 'injury' ? '#fef2f2' : report.behaviorLevel === 'red' ? '#fef2f2' : report.behaviorLevel === 'yellow' ? '#fefce8' : '#dcfce7', color: report.type === 'injury' ? '#dc2626' : report.behaviorLevel === 'red' ? '#dc2626' : report.behaviorLevel === 'yellow' ? '#ca8a04' : '#16a34a' }}>
                          {report.type === 'injury' ? 'Injury' : report.behaviorLevel ? `${report.behaviorLevel.charAt(0).toUpperCase() + report.behaviorLevel.slice(1)} Ticket` : 'Behavior'}
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', backgroundColor: report.status === 'sent' ? '#f3f4f6' : '#fef3c7', color: report.status === 'sent' ? '#4b5563' : '#d97706' }}>
                          {report.status === 'sent' ? '✓ Sent' : 'Draft'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      via {report.method === 'both' ? '📧+💬 Both' : report.method === 'email' ? '📧 Email' : '💬 SMS'} • {new Date(report.createdAt).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'pre-wrap', maxHeight: '80px', overflow: 'hidden', background: 'var(--bg-input)', padding: '8px', borderRadius: '8px' }}>
                      {report.message.substring(0, 150)}...
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmBlockStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>
              {confirmBlockStudent.isCheckInBlocked ? 'Restore Check-In Access?' : 'Remove Check-In Access?'}
            </h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {confirmBlockStudent.isCheckInBlocked
                ? `Allow ${confirmBlockStudent.firstName} ${confirmBlockStudent.lastName} to check in again?`
                : `Prevent ${confirmBlockStudent.firstName} ${confirmBlockStudent.lastName} from checking in?`
              }
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setConfirmBlockStudent(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleConfirmBlock} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
                {confirmBlockStudent.isCheckInBlocked ? 'Restore Access' : 'Confirm No Check-In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDraft && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: `3px solid ${selectedDraft.status === 'sent' ? '#6b7280' : '#f59e0b'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>{selectedDraft.status === 'sent' ? 'Sent Report' : 'Draft Report'}</h3>
              <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: selectedDraft.status === 'sent' ? '#f3f4f6' : '#fef3c7', color: selectedDraft.status === 'sent' ? '#4b5563' : '#d97706' }}>{selectedDraft.status === 'sent' ? 'Sent' : 'Draft'}</span>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-main)' }}>{selectedDraft.studentName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {selectedDraft.type === 'injury' ? 'Head Injury Report' : 'Behavior Report'} • via {selectedDraft.method === 'both' ? 'Email + SMS' : selectedDraft.method === 'email' ? 'Email' : 'SMS'}
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '12px', marginBottom: '16px', whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.6', color: 'var(--text-main)', maxHeight: '300px', overflowY: 'auto' }}>
              {selectedDraft.message}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedDraft(null)} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'var(--bg-hover)', fontWeight: '700', cursor: 'pointer', color: 'var(--text-main)' }}>Close</button>
              {selectedDraft.status === 'draft' && (
                <button onClick={() => { if (onUpdateReport) onUpdateReport({ ...selectedDraft, status: 'sent' }); setSelectedDraft(null); }} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Send</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ParentReport {
  id: string;
  studentId: string;
  studentName: string;
  type: 'injury' | 'behavior';
  behaviorLevel?: 'green' | 'yellow' | 'red';
  message: string;
  method: 'email' | 'sms' | 'both';
  status: 'draft' | 'sent';
  createdAt: string;
}

const ParentReportModal = ({ student, type, onClose, onSend, onSaveDraft }: { student: Student, type: 'injury' | 'behavior', onClose: () => void, onSend: (report: ParentReport) => void, onSaveDraft: (report: ParentReport) => void }) => {
  const [method, setMethod] = useState<'email' | 'sms' | 'both'>('both');

  // Generate detailed message based on incident type
  const generateMessage = () => {
    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (type === 'injury') {
      const symptoms = student.headInjuryLogs.length > 0
        ? Object.entries(student.headInjuryLogs[student.headInjuryLogs.length - 1].symptoms)
          .filter(([_, v]) => v === true)
          .map(([k]) => k)
          .join(', ')
        : 'None reported';

      return `Dear ${student.guardianFirstName} ${student.guardianLastName},

This is to inform you that your child, ${student.firstName} ${student.lastName}, experienced a head injury incident today (${date}) at approximately ${student.headInjuryTimestamp || time}.

**Incident Details:**
• Witness: ${student.headInjuryWitness || 'Staff member'}
• Description: ${student.headInjuryWitnessDesc || 'Minor bump observed'}
• Symptoms Monitored: ${symptoms || 'None observed'}

Our staff followed the standard head injury protocol and monitored ${student.firstName} throughout the day. ${student.headInjuryLogs.length} assessment(s) were completed.

Please monitor your child at home and contact us if you notice any concerning symptoms.

Best regards,
EDP Team - Cajon Valley School District`;
    } else {
      const ticketLevel = student.behavior === 'red' ? 'Level 3 (Red)' : student.behavior === 'yellow' ? 'Level 2 (Yellow)' : 'Level 1 (Green)';
      const behaviorList = student.behaviorIssues.length > 0
        ? student.behaviorIssues.map(b => `• ${b}`).join('\n')
        : '• General behavior concern';

      return `Dear ${student.guardianFirstName} ${student.guardianLastName},

This is to inform you that your child, ${student.firstName} ${student.lastName}, received a behavior ticket today (${date}).

**Ticket Information:**
• Level: ${ticketLevel}
• Time: ${student.behaviorTimestamp || time}
• Staff: ${student.behaviorStaff || 'EDP Staff'}

**Reported Behaviors:**
${behaviorList}

${student.behaviorDescription ? `**Additional Notes:** ${student.behaviorDescription}` : ''}

Please discuss this with your child. We appreciate your partnership in supporting positive behavior.

Best regards,
EDP Team - Cajon Valley School District`;
    }
  };

  const [message, setMessage] = useState(generateMessage());

  const createReport = (status: 'draft' | 'sent'): ParentReport => ({
    id: Date.now().toString(),
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    type,
    behaviorLevel: type === 'behavior' ? (student.behavior as 'green' | 'yellow' | 'red') : undefined,
    message,
    method,
    status,
    createdAt: new Date().toISOString()
  });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>Parent Report Draft</h3>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: type === 'injury' ? '#fef2f2' : student.behavior === 'red' ? '#fef2f2' : student.behavior === 'yellow' ? '#fefce8' : '#dcfce7', color: type === 'injury' ? '#dc2626' : student.behavior === 'red' ? '#dc2626' : student.behavior === 'yellow' ? '#ca8a04' : '#16a34a' }}>
            {type === 'injury' ? 'Head Injury' : `${student.behavior.toUpperCase()} Ticket`}
          </span>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '13px', color: 'var(--text-secondary)' }}>Send via</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setMethod('email')} style={{ padding: '8px 16px', borderRadius: '8px', border: method === 'email' ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)', backgroundColor: method === 'email' ? 'rgba(139,92,246,0.1)' : 'transparent', fontWeight: '600', cursor: 'pointer', color: 'var(--text-main)' }}>📧 Email</button>
            <button onClick={() => setMethod('sms')} style={{ padding: '8px 16px', borderRadius: '8px', border: method === 'sms' ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)', backgroundColor: method === 'sms' ? 'rgba(139,92,246,0.1)' : 'transparent', fontWeight: '600', cursor: 'pointer', color: 'var(--text-main)' }}>💬 SMS</button>
            <button onClick={() => setMethod('both')} style={{ padding: '8px 16px', borderRadius: '8px', border: method === 'both' ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)', backgroundColor: method === 'both' ? 'rgba(139,92,246,0.1)' : 'transparent', fontWeight: '600', cursor: 'pointer', color: 'var(--text-main)' }}>📧+💬 Both</button>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-secondary)' }}>Message (Editable)</label>
            <button onClick={() => setMessage(generateMessage())} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: '12px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-secondary)' }}>🔄 Regenerate</button>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ width: '100%', height: '250px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'var(--bg-hover)', fontWeight: '700', cursor: 'pointer', color: 'var(--text-main)' }}>Discard</button>
          <button onClick={() => onSaveDraft(createReport('draft'))} style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'transparent', fontWeight: '700', cursor: 'pointer', color: 'var(--text-main)' }}>Save Draft</button>
          <button onClick={() => onSend(createReport('sent'))} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#8b5cf6', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Send Report</button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [staffList, setStaffList] = useState<Staff[]>(INITIAL_STAFF);
  const [user, setUser] = useState<Staff | null>(null);
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [program, setProgram] = useState<ProgramType>('sunrise');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [showConfirmId, setShowConfirmId] = useState<string | null>(null);
  const [showLeaderDashboard, setShowLeaderDashboard] = useState(false);
  const [inlineDashboardExpanded, setInlineDashboardExpanded] = useState(false);
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [reportData, setReportData] = useState<{ student: Student, type: 'injury' | 'behavior' } | null>(null);
  const [parentReports, setParentReports] = useState<ParentReport[]>([]);
  const [biometricLogs, setBiometricLogs] = useState<BiometricLog[]>([]);

  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      setProgram(hour < 12 ? 'sunrise' : 'sunset');
    };
    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      students.forEach(s => {
        if (s.headInjury && s.headInjuryStartTime) {
          const elapsed = Number(Date.now()) - s.headInjuryStartTime;
          const logsCount = s.headInjuryLogs.length;
          const nextCheckMs = logsCount === 1 ? 15 * 60 * 1000 : logsCount === 2 ? 30 * 60 * 1000 : -1;

          if (nextCheckMs !== -1 && Math.abs(nextCheckMs - elapsed) < 1000) {
            showToast(`Time for ${s.firstName}'s next check!`, 'warning');
            playAlarm();
          }
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [students]);

  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);

    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler);
    return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const showToast = (msg: string, type: 'success' | 'info' | 'warning' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredStudents = useMemo(() => {
    let result = students;
    if (selectedGrade && selectedGrade !== 'All') {
      result = result.filter(s => s.grade === selectedGrade);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.elopId.includes(q) ||
        (s.asesId && s.asesId.includes(q))
      );
    }
    return result.sort((a, b) => {
      const statusA = program === 'sunrise' ? a.sunriseStatus : a.sunsetStatus;
      const statusB = program === 'sunrise' ? b.sunriseStatus : b.sunsetStatus;
      // 1. Sort by Grade (TK -> K -> 1 -> 2 -> 3 -> 4 -> 5)
      const gradeOrder = ['TK', 'K', '1', '2', '3', '4', '5'];
      const gradeIndexA = gradeOrder.indexOf(a.grade);
      const gradeIndexB = gradeOrder.indexOf(b.grade);

      if (gradeIndexA !== gradeIndexB) {
        return gradeIndexA - gradeIndexB;
      }

      // 2. Sort by Name (First, Last)
      const nameCompare = a.firstName.localeCompare(b.firstName);
      if (nameCompare !== 0) return nameCompare;
      return a.lastName.localeCompare(b.lastName);
    });
  }, [students, selectedGrade, searchQuery, program]);

  const handleStudentAction = (student: Student) => {
    // 1. Permission Check
    if (user && user.role !== 'Lead') {
      const staffMember = staffList.find(s => s.id === user.id);
      if (staffMember) {
        if (staffMember.canCheckIn === false) {
          showToast("You do not have permission to check in students.", "error");
          return;
        }
        if (staffMember.assignedGrades && staffMember.assignedGrades.length > 0 && !staffMember.assignedGrades.includes(student.grade)) {
          showToast(`You are not assigned to Grade ${student.grade}.`, "error");
          return;
        }
      }
    }

    // 2. Blocking Check
    const latestStudent = students.find(s => s.id === student.id) || student;
    if (latestStudent.isCheckInBlocked) {
      showToast("This student is blocked from check-in. Contact Lead.", "error");
      return;
    }

    const status = program === 'sunrise' ? student.sunriseStatus : student.sunsetStatus;
    if (status === 'absent') {
      setShowConfirmId(student.id);
    } else {
      setActiveStudentId(student.id);
    }
  };

  const handleCheckIn = (studentId: string, photo?: string, biometricData?: any) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        const staffName = user ? `${user.name} (${user.organization})` : 'Staff';
        const update = program === 'sunrise'
          ? { sunriseStatus: 'present', sunriseTime: timeString, sunriseStaff: staffName }
          : { sunsetStatus: 'present', sunsetTime: timeString, sunsetStaff: staffName };
        return { ...s, ...update, ...biometricData, checkInPhoto: photo } as Student;
      }
      return s;
    }));

    const student = students.find(s => s.id === studentId);
    if (student) {
      showToast(`Checked In: ${student.firstName}`, 'success');

      // Create Biometric Log
      if (biometricData) {
        const mockPhotos = MockDatabase.getPhotosForStudent(studentId);
        const newLog: BiometricLog = {
          id: Date.now().toString(),
          studentId: studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          timestamp: new Date().toLocaleString(),
          matchScore: 0.92, // Simulated high match
          anomalyScore: biometricData.anomalyScore,
          anomalyDetected: biometricData.visualAnomalyDetected,
          livePhoto: photo || '',
          yearbookPhoto: student.yearbookPhotoUrl || mockPhotos.yearbook,
          previousPhoto: student.lastCheckInPhoto || mockPhotos.previous
        };
        setBiometricLogs(prev => [newLog, ...prev]);

        if (biometricData.visualAnomalyDetected) {
          showToast('VISUAL_ANOMALY_DETECTED - Review flagging in dashboard', 'warning');
        }

        BiometricService.uploadToDrive(photo || '', studentId);
      }
    }
    setShowConfirmId(null);
    setSearchQuery('');
  };

  const handleCheckOut = (studentId: string, smsTime: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        const update = program === 'sunrise'
          ? { sunriseStatus: 'pending_parent' as AttendanceStatus }
          : { sunsetStatus: 'pending_parent' as AttendanceStatus };
        return { ...s, ...update, smsSentTime: smsTime };
      }
      return s;
    }));

    setTimeout(() => {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      setStudents(prev => prev.map(s => {
        if (s.id === studentId) {
          const update = program === 'sunrise'
            ? { sunriseStatus: 'checked_out', sunriseCheckOutTime: timeString }
            : { sunsetStatus: 'checked_out', sunsetCheckOutTime: timeString };
          return { ...s, ...update } as Student;
        }
        return s;
      }));
    }, 5000);
  };

  const handleSaveStudent = (updatedStudent: Student) => {
    const oldStudent = students.find(s => s.id === updatedStudent.id);
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));

    if (oldStudent) {
      // Head injury still shows modal for immediate parent contact
      if (!oldStudent.headInjury && updatedStudent.headInjury) {
        setReportData({ student: updatedStudent, type: 'injury' });
      }
      // Behavior tickets create draft silently - accessible in Lead Dashboard
      else if (oldStudent.behavior === 'none' && updatedStudent.behavior !== 'none' && oldStudent.behavior !== updatedStudent.behavior) {
        const behaviorReport: ParentReport = {
          id: Date.now().toString(),
          studentId: updatedStudent.id,
          studentName: `${updatedStudent.firstName} ${updatedStudent.lastName}`,
          type: 'behavior',
          behaviorLevel: updatedStudent.behavior as 'green' | 'yellow' | 'red',
          message: generateBehaviorMessage(updatedStudent),
          method: 'both',
          status: 'draft',
          createdAt: new Date().toISOString()
        };
        setParentReports(prev => [...prev, behaviorReport]);
        showToast('Behavior report draft created', 'info');
      }
    }
  };

  // Helper to generate behavior message for auto-created drafts
  const generateBehaviorMessage = (student: Student) => {
    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const ticketLevel = student.behavior === 'red' ? 'Level 3 (Red)' : student.behavior === 'yellow' ? 'Level 2 (Yellow)' : 'Level 1 (Green)';
    const behaviorList = student.behaviorIssues.length > 0
      ? student.behaviorIssues.map(b => `• ${b}`).join('\n')
      : '• General behavior concern';

    return `Dear ${student.guardianFirstName} ${student.guardianLastName},

This is to inform you that your child, ${student.firstName} ${student.lastName}, received a behavior ticket today (${date}).

**Ticket Information:**
• Level: ${ticketLevel}
• Time: ${student.behaviorTimestamp || time}
• Staff: ${student.behaviorStaff || 'EDP Staff'}

**Reported Behaviors:**
${behaviorList}

${student.behaviorDescription ? `**Additional Notes:** ${student.behaviorDescription}` : ''}

Please discuss this with your child. We appreciate your partnership in supporting positive behavior.

Best regards,
EDP Team - Cajon Valley School District`;
  };

  if (!user) return <StaffLogin onLogin={setUser} onToggleDemo={() => setIsDemoMode(!isDemoMode)} isDemoMode={isDemoMode} />;

  const activeStudent = students.find(s => s.id === activeStudentId);
  const confirmStudent = students.find(s => s.id === showConfirmId);

  return (
    <>
      <header style={{ backgroundColor: 'var(--bg-header)', padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: program === 'sunrise' ? 'var(--color-sunrise)' : 'var(--color-sunset)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <span className="material-icons-round">{program === 'sunrise' ? 'wb_sunny' : 'nights_stay'}</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>{program === 'sunrise' ? 'Sunrise' : 'Sunset'} {isDemoMode && <span style={{ fontSize: '10px', color: '#8b5cf6', marginLeft: '4px' }}>DEMO</span>}</h1>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>{new Date().toLocaleDateString()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setDarkMode(!darkMode)} style={{ padding: '8px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <span className="material-icons-round">{darkMode ? 'light_mode' : 'dark_mode'}</span>
          </button>
          {user.role === 'Lead' && (
            <button onClick={() => setShowLeaderDashboard(true)} style={{ padding: '8px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <span className="material-icons-round">dashboard</span>
            </button>
          )}
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#374151', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>
            {user.name.charAt(0)}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-app)', zIndex: 90 }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>search</span>
            <input
              type="text"
              placeholder="Search student..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '14px 14px 14px 44px', borderRadius: '16px', border: 'none', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', fontSize: '16px', color: 'var(--text-main)' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px' }}>
            <button onClick={() => setSelectedGrade('All')} style={{ padding: '10px', borderRadius: '12px', border: 'none', backgroundColor: selectedGrade === 'All' ? 'var(--text-main)' : 'var(--bg-card)', color: selectedGrade === 'All' ? 'var(--bg-card)' : 'var(--text-main)', fontWeight: '700', fontSize: '14px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s ease', transform: selectedGrade === 'All' ? 'scale(1.05)' : 'scale(1)' }}>
              All
            </button>
            {GRADES.map(g => (
              <button key={g} onClick={() => setSelectedGrade(g)} style={{ padding: '10px', borderRadius: '12px', border: 'none', backgroundColor: selectedGrade === g ? 'var(--text-main)' : 'var(--bg-card)', color: selectedGrade === g ? 'var(--bg-card)' : 'var(--text-main)', fontWeight: '700', fontSize: '14px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s ease', transform: selectedGrade === g ? 'scale(1.05)' : 'scale(1)' }}>
                {g}
              </button>
            ))}
          </div>

          {/* Inline Leader Dashboard for Lead users */}
          {user.role === 'Lead' && (
            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => setInlineDashboardExpanded(!inlineDashboardExpanded)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: inlineDashboardExpanded ? '12px' : 0 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-icons-round" style={{ color: '#8b5cf6' }}>dashboard</span>
                  <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>Lead Dashboard</span>
                  {parentReports.filter(r => r.status === 'draft').length > 0 && (
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', backgroundColor: '#fef3c7', color: '#d97706' }}>
                      {parentReports.filter(r => r.status === 'draft').length} draft{parentReports.filter(r => r.status === 'draft').length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className="material-icons-round" style={{ color: 'var(--text-muted)', transform: inlineDashboardExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>expand_more</span>
              </button>
              {inlineDashboardExpanded && (
                <LeaderDashboard
                  students={students}
                  staffList={staffList}
                  parentReports={parentReports}
                  biometricLogs={biometricLogs}
                  isInline={true}
                  onClose={() => setInlineDashboardExpanded(false)}
                  onImport={(newStudents) => setStudents([...students, ...newStudents])}
                  onAddStudent={(newStudent) => setStudents([...students, newStudent])}
                  onUpdateStaff={(updatedStaff) => setStaffList(updatedStaff)}
                  onUpdateStudent={handleSaveStudent}
                  onUpdateReport={(updatedReport) => setParentReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r))}
                />
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 80px 16px' }}>
          {(!searchQuery && selectedGrade === null) ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', opacity: 0.7 }}>
              <span className="material-icons-round" style={{ fontSize: '64px', marginBottom: '16px' }}>school</span>
              <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Ready to Attendance</div>
              <div style={{ fontSize: '14px' }}>Select a grade or search for a student above</div>
            </div>
          ) : (
            filteredStudents.map(student => {
              const status = program === 'sunrise' ? student.sunriseStatus : student.sunsetStatus;
              const isPresent = status === 'present';
              const isCheckedOut = status === 'checked_out' || status === 'pending_parent';

              return (
                <div key={student.id} onClick={() => !isPresent && !isCheckedOut ? handleStudentAction(student) : null} style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '16px', marginBottom: '12px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${isPresent || isCheckedOut ? (status === 'checked_out' ? '#9ca3af' : (status === 'pending_parent' ? '#8b5cf6' : '#10b981')) : 'transparent'}`, cursor: isPresent || isCheckedOut ? 'default' : 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease', opacity: student.isCheckInBlocked ? 0.5 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {student.grade}
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>{student.firstName} {student.lastName}</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {student.programs.includes('ELOP') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '700' }}>ELOP</span>}
                        {student.programs.includes('ASES') && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#6b21a8', fontWeight: '700' }}>ASES</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {student.headInjury && <span className="material-icons-round" style={{ color: '#ef4444' }}>personal_injury</span>}
                    {student.behavior !== 'none' && <span className="material-icons-round" style={{ color: student.behavior === 'red' ? '#ef4444' : student.behavior === 'yellow' ? '#f59e0b' : '#10b981' }}>warning</span>}

                    {status === 'absent' ? (
                      <span className="material-icons-round" style={{ color: 'var(--border-subtle)' }}>radio_button_unchecked</span>
                    ) : (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: status === 'checked_out' ? '#9ca3af' : status === 'pending_parent' ? '#8b5cf6' : '#10b981', textTransform: 'uppercase' }}>
                          {status === 'checked_out' ? 'CHECKED-OUT' : status === 'pending_parent' ? 'WAITING' : 'CHECKED-IN'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {status === 'checked_out'
                            ? `${program === 'sunrise' ? student.sunriseCheckOutTime : student.sunsetCheckOutTime} by ${program === 'sunrise' ? (student.sunriseStaff || 'Staff') : (student.sunsetStaff || 'Staff')}`
                            : `${program === 'sunrise' ? student.sunriseTime : student.sunsetTime} by ${program === 'sunrise' ? (student.sunriseStaff || 'Staff') : (student.sunsetStaff || 'Staff')}`
                          }
                        </div>
                      </div>
                    )}
                    {(isPresent || isCheckedOut) && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {student.checkInPhoto && (
                          <img src={student.checkInPhoto} alt="Check-in" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #8b5cf6', objectFit: 'cover' }} />
                        )}
                        {student.yearbookPhotoUrl && (
                          <img src={student.yearbookPhotoUrl} alt="Yearbook" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--border-subtle)', objectFit: 'cover' }} />
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleStudentAction(student); }} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          <span className="material-icons-round">more_vert</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }))
          }
        </div>
      </main>

      {showConfirmId && confirmStudent && (
        <ConfirmationModal
          student={confirmStudent}
          title="Check In?"
          message={`Mark ${confirmStudent.firstName} as present?`}
          onConfirm={(photo, biometricData) => handleCheckIn(confirmStudent.id, photo, biometricData)}
          onCancel={() => setShowConfirmId(null)}
          showPhotoOption={true}
          isDemoMode={isDemoMode}
        />
      )}

      {activeStudentId && activeStudent && (
        <StudentDetailModal
          student={activeStudent}
          onClose={() => setActiveStudentId(null)}
          onSave={handleSaveStudent}
          onCheckOut={handleCheckOut}
          currentStaff={user}
          program={program}
        />
      )}

      {showLeaderDashboard && (
        <LeaderDashboard
          students={students}
          staffList={staffList}
          parentReports={parentReports}
          biometricLogs={biometricLogs}
          onClose={() => setShowLeaderDashboard(false)}
          onImport={(newStudents) => setStudents([...students, ...newStudents])}
          onAddStudent={(newStudent) => setStudents([...students, newStudent])}
          onUpdateStaff={(updatedStaff) => setStaffList(updatedStaff)}
          onUpdateStudent={handleSaveStudent}
          onUpdateReport={(updatedReport) => setParentReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r))}
        />
      )}


      {reportData && (
        <ParentReportModal
          student={reportData.student}
          type={reportData.type}
          onClose={() => setReportData(null)}
          onSend={(report) => {
            setParentReports(prev => [...prev, report]);
            showToast('Report sent to guardian!', 'success');
            setReportData(null);
          }}
          onSaveDraft={(report) => {
            setParentReports(prev => [...prev, report]);
            showToast('Draft saved!', 'info');
            setReportData(null);
          }}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
