// src/components/HeadInjuryChecklist.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { Student, HeadInjuryLog } from '../types';
import { HEAD_INJURY_SYMPTOMS } from '../constants';
import { formatTimeWithMs } from '../utils/helpers';

interface HeadInjuryChecklistProps {
    student: Student;
    onUpdate: (updates: Partial<Student>, logs?: HeadInjuryLog[]) => void;
    currentStaffName: string;
    isLead: boolean;
    darkMode: boolean;
    timeLeft?: number; // timer passed from parent
}

const HeadInjuryChecklist = ({ student, onUpdate, currentStaffName, isLead, darkMode, timeLeft = 0 }: HeadInjuryChecklistProps) => {
    // Helper: determine which stage is next to fill out
    const getNextStage = (): '0min' | '15min' | '30min' => {
        const has0 = student.headInjuryLogs.some(l => l.stage === '0min');
        const has15 = student.headInjuryLogs.some(l => l.stage === '15min');
        if (!has0) return '0min';
        if (!has15) return '15min';
        return '30min';
    };

    // Helper: get the last completed stage
    const getLastCompletedStage = (): '0min' | '15min' | '30min' | null => {
        const has30 = student.headInjuryLogs.some(l => l.stage === '30min');
        const has15 = student.headInjuryLogs.some(l => l.stage === '15min');
        const has0 = student.headInjuryLogs.some(l => l.stage === '0min');
        if (has30) return '30min';
        if (has15) return '15min';
        if (has0) return '0min';
        return null;
    };

    // Helper: compute whether monitoring timer is active from raw data
    const computeIsTimerActive = (): boolean => {
        if (!student.headInjuryStartTime || !student.headInjury) return false;
        const elapsed = Date.now() - student.headInjuryStartTime;
        const has15 = student.headInjuryLogs.some(l => l.stage === '15min');
        const has30 = student.headInjuryLogs.some(l => l.stage === '30min');
        if (has30) return false;
        const nextCheck = has15 ? 30 * 60 * 1000 : 15 * 60 * 1000;
        return elapsed < nextCheck;
    };

    // Compute initial tab
    const getInitialTab = (): '0min' | '15min' | '30min' => {
        if (computeIsTimerActive()) {
            const lastCompleted = getLastCompletedStage();
            if (lastCompleted) return lastCompleted;
        }
        return getNextStage();
    };

    const [activeTab, setActiveTab] = useState<'0min' | '15min' | '30min'>(getInitialTab);
    const [currentSymptoms, setCurrentSymptoms] = useState<Record<string, boolean>>({});
    const [notes, setNotes] = useState('');
    const [surveyCompleted, setSurveyCompleted] = useState(false);
    const [showNewReportForm, setShowNewReportForm] = useState(!student.headInjury);
    const [witnessText, setWitnessText] = useState(student.headInjuryWitnessDesc || '');
    const [witnessDone, setWitnessDone] = useState(!!student.headInjuryWitnessDesc);
    const [additionalComments, setAdditionalComments] = useState('');
    const justSavedRef = useRef(false);
    const prevTimeLeftRef = useRef(timeLeft);

    // Sync witness state
    useEffect(() => {
        if (student.headInjuryWitnessDesc) {
            setWitnessText(student.headInjuryWitnessDesc);
            setWitnessDone(true);
            setShowNewReportForm(true);
        }
    }, [student.headInjuryWitnessDesc]);

    // Handle external log changes
    useEffect(() => {
        if (justSavedRef.current) {
            justSavedRef.current = false;
            return;
        }
        if (computeIsTimerActive()) {
            const lastCompleted = getLastCompletedStage();
            if (lastCompleted) {
                setActiveTab(lastCompleted);
                return;
            }
        }
        setActiveTab(getNextStage());
    }, [student.headInjuryLogs]);

    // When timer expires, auto-advance
    useEffect(() => {
        if (prevTimeLeftRef.current > 0 && timeLeft === 0) {
            setActiveTab(getNextStage());
        }
        prevTimeLeftRef.current = timeLeft;
    }, [timeLeft, student.headInjuryLogs]);

    // Load symptoms/notes when switching tabs
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
        setAdditionalComments('');
    }, [activeTab, student.headInjuryLogs]);

    const handleSaveLog = (commentOverride?: string) => {
        const newLog: HeadInjuryLog = {
            stage: activeTab,
            completedAt: new Date().toISOString(),
            staffName: currentStaffName,
            symptoms: currentSymptoms,
            notes: commentOverride !== undefined ? commentOverride : notes
        };
        const updatedLogs = [...student.headInjuryLogs.filter(l => l.stage !== activeTab), newLog];

        let startTime = student.headInjuryStartTime;
        if (activeTab === '0min' && !startTime) {
            startTime = Number(Date.now());
        }

        justSavedRef.current = true;

        onUpdate({
            headInjury: true,
            headInjuryTimestamp: new Date().toLocaleString([], { month: 'numeric', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
            headInjuryStartTime: startTime
        }, updatedLogs);
    };

    const handleWitnessDone = () => {
        if (!witnessText.trim()) return;
        setWitnessDone(true);
        onUpdate({
            headInjuryWitnessDesc: witnessText,
            headInjuryWitness: currentStaffName,
            headInjuryTimestamp: new Date().toLocaleString([], { month: 'numeric', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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

    const handleSaveComments = () => {
        handleSaveLog(additionalComments);
        setAdditionalComments('');
    };

    const handleCancelComments = () => {
        // Go back to editing the questionnaire
        setSurveyCompleted(false);
        setAdditionalComments('');
    };

    const isReadOnly = !!student.headInjuryLogs.find(l => l.stage === activeTab);
    const hasYesSymptoms = Object.values(currentSymptoms).some(val => val === true);
    const isMonitoring = isReadOnly && timeLeft > 0;
    const nextStage = getNextStage();

    // Determine if we need the additional comments box
    // This is true when: survey is done, there are YES symptoms, and this stage hasn't been saved yet
    const needsComments = surveyCompleted && hasYesSymptoms && !isReadOnly;

    // Get all completed logs sorted by stage order for the cumulative summary
    const stageOrder = ['0min', '15min', '30min'];
    const completedLogs = student.headInjuryLogs
        .slice()
        .sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage));

    // Render the results for a single log entry
    const renderLogResults = (log: HeadInjuryLog) => {
        const logAllNo = Object.values(log.symptoms).every(v => v === false);
        return (
            <div key={log.stage}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase' }}>
                    Assessment Results ({log.stage})
                </div>
                {logAllNo ? (
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> "No" to All Symptoms
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                        {Object.entries(log.symptoms).map(([symptom, val]) => (
                            <div key={symptom} style={{ fontSize: '12px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: '700', color: val ? '#dc2626' : '#16a34a', fontSize: '11px', width: '14px' }}>{val ? 'Y' : 'N'}</span>
                                <span style={{ fontWeight: '500' }}>{symptom}</span>
                            </div>
                        ))}
                        {log.notes && (
                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#991b1b', fontStyle: 'italic' }}>
                                <span style={{ fontWeight: '700' }}>Comments:</span> {log.notes}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            className={witnessDone ? "responsive-modal-grid" : ""}
            style={!witnessDone ? {
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '20px'
            } : undefined}
        >
            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {!witnessDone ? (
                    /* ===== EDITABLE WITNESS STATEMENT (only before first Done) ===== */
                    <>
                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
                                WITNESS STATEMENT
                            </label>
                            <textarea
                                value={witnessText}
                                onChange={(e) => setWitnessText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && witnessText.trim()) {
                                        e.preventDefault();
                                        handleWitnessDone();
                                    }
                                }}
                                placeholder="Describe how the injury occurred..."
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', minHeight: '120px', fontFamily: 'inherit', outline: 'none', resize: 'none' }}
                            />
                        </div>
                        <button onClick={handleCancelReport} style={{ padding: '14px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handleWitnessDone} disabled={!witnessText.trim()} style={{ padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--color-danger)', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: witnessText.trim() ? 1 : 0.5 }}>Done</button>
                    </>

                ) : needsComments ? (
                    /* ===== ADDITIONAL COMMENTS BOX (replaces summary when YES symptoms found) ===== */
                    <>
                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
                                ADDITIONAL COMMENTS
                            </label>
                            <textarea
                                value={additionalComments}
                                onChange={(e) => setAdditionalComments(e.target.value)}
                                placeholder="Describe any additional observations about the symptoms..."
                                autoFocus
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', minHeight: '120px', fontFamily: 'inherit', outline: 'none', resize: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={handleCancelComments} style={{ flex: 1, padding: '14px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSaveComments} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Save Comments</button>
                        </div>
                    </>

                ) : (
                    /* ===== SUMMARY BOX + TIMER / ACTION BUTTONS ===== */
                    <>
                        {completedLogs.length > 0 ? (
                            /* Cumulative summary box */
                            <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '16px', border: '1px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '35vh', minHeight: 0 }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: '#ef4444' }}>local_hospital</span>
                                    <span style={{ fontWeight: '800', color: '#991b1b', fontSize: '14px' }}>
                                        Head Injury Report Submitted
                                    </span>
                                </div>

                                {/* Witness Statement */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b', opacity: 0.8, marginBottom: '2px', textTransform: 'uppercase' }}>Witness Statement</div>
                                    <div style={{ fontSize: '13px', color: '#991b1b', fontWeight: '500', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                                        {student.headInjuryWitnessDesc || witnessText}
                                    </div>
                                </div>

                                {/* All completed stage results */}
                                {completedLogs.map(log => renderLogResults(log))}

                                {/* Submitted by footer */}
                                <div style={{ paddingTop: '12px', borderTop: '1px solid #ef444440', fontSize: '11px', color: '#991b1b', opacity: 0.9 }}>
                                    Submitted by <span style={{ fontWeight: '700' }}>{student.headInjuryWitness || currentStaffName}</span> on {student.headInjuryTimestamp || 'Unknown Date'}
                                </div>
                            </div>
                        ) : (
                            /* No completed logs yet — show read-only witness statement card */
                            <div style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
                                    WITNESS STATEMENT {student.headInjuryTimestamp && <span style={{ fontWeight: '400', fontSize: '13px' }}>• Reported by {student.headInjuryWitness || currentStaffName} at {student.headInjuryTimestamp}</span>}
                                </label>
                                <textarea
                                    value={witnessText}
                                    disabled
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', minHeight: '120px', fontFamily: 'inherit', outline: 'none', resize: 'none', opacity: 0.7 }}
                                />
                            </div>
                        )}

                        {/* Timer or action buttons */}
                        {isMonitoring ? (
                            /* Timer box — fixed at bottom */
                            <div style={{ backgroundColor: 'var(--bg-app)', borderRadius: '8px', padding: '16px', textAlign: 'center', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Active Monitoring</div>
                                <div style={{ fontSize: '28px', fontWeight: '800', color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatTimeWithMs(timeLeft)}
                                </div>
                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Next assessment unlocks automatically</div>
                            </div>
                        ) : witnessDone && isLead && !isReadOnly && hasYesSymptoms && !surveyCompleted ? (
                            <button onClick={handleYesDone} style={{ width: '100%', padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', flexShrink: 0 }}>Done (Issues Found)</button>
                        ) : null}

                        {/* ACTION BUTTONS — directly beneath witness statement / summary */}
                        {witnessDone && isLead && !isReadOnly && (
                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                <button onClick={handleCancelReport} style={{ flex: 1, padding: '14px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                {!surveyCompleted ? (
                                    <button onClick={handleNoToAll} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>"No" to All</button>
                                ) : (
                                    <button onClick={handleSaveLog} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Save Assessment</button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* RIGHT COLUMN: Questionnaire (only shown after witness done) */}
            {witnessDone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Time-based pills */}
                    {isLead && (
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            {(['0min', '15min', '30min'] as const).map(stage => {
                                const isDone = student.headInjuryLogs.some(l => l.stage === stage);
                                const isActive = activeTab === stage;
                                const isClickable = isDone || (stage === nextStage && timeLeft === 0);
                                return (
                                    <button
                                        key={stage}
                                        onClick={() => {
                                            if (isClickable) {
                                                setActiveTab(stage);
                                            }
                                        }}
                                        disabled={!isClickable}
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            borderRadius: '12px',
                                            border: 'none',
                                            backgroundColor: isActive ? 'var(--text-main)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'),
                                            color: isActive ? 'var(--bg-card)' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'),
                                            opacity: !isClickable ? 0.5 : 1,
                                            fontWeight: '800',
                                            fontSize: '14px',
                                            cursor: isClickable ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {stage} {isDone && '✓'}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Scrollable questionnaire — grayed out when viewing a completed tab */}
                    <div style={{ flex: '1', overflowY: 'scroll', opacity: isReadOnly ? 0.4 : (surveyCompleted ? 0.6 : 1), pointerEvents: isReadOnly ? 'none' : (surveyCompleted ? 'none' : 'auto'), display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '8px', border: '1px solid var(--border-subtle)' }}>
                        {isLead && Object.entries(HEAD_INJURY_SYMPTOMS).map(([category, symptoms]) => (
                            <div key={category} style={{ backgroundColor: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {category} Symptoms
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {symptoms.map(symptom => (
                                        <div key={symptom} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--bg-app)' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-main)', flex: 1, paddingRight: '4px', fontWeight: '500' }}>{symptom}</span>
                                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
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

                </div>
            )}


        </div>
    );
};

export default HeadInjuryChecklist;
