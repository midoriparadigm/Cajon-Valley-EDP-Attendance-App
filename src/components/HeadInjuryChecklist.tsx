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
    const [activeTab, setActiveTab] = useState<'0min' | '15min' | '30min'>('0min');
    const [currentSymptoms, setCurrentSymptoms] = useState<Record<string, boolean>>({});
    const [notes, setNotes] = useState('');
    const [surveyCompleted, setSurveyCompleted] = useState(false);
    const [showNewReportForm, setShowNewReportForm] = useState(!student.headInjury);
    const [witnessText, setWitnessText] = useState('');
    const [witnessDone, setWitnessDone] = useState(false);
    const justSavedRef = useRef(false); // prevents auto-advancing on save
    const prevTimeLeftRef = useRef(timeLeft);

    // Determine which stage is the "next" one to fill out
    const getNextStage = (): '0min' | '15min' | '30min' => {
        const logs = student.headInjuryLogs;
        const has0 = logs.some(l => l.stage === '0min');
        const has15 = logs.some(l => l.stage === '15min');
        if (!has0) return '0min';
        if (!has15) return '15min';
        return '30min';
    };

    // Initial setup: set tab based on logs & witness state (only on mount / external changes)
    useEffect(() => {
        if (justSavedRef.current) {
            // Don't auto-advance right after saving — stay on the saved tab
            justSavedRef.current = false;
            return;
        }

        const nextStage = getNextStage();
        setActiveTab(nextStage);

        if (student.headInjuryWitnessDesc) {
            setWitnessText(student.headInjuryWitnessDesc);
            setWitnessDone(true);
            setShowNewReportForm(true);
        }
    }, [student.headInjuryLogs, student.headInjuryWitnessDesc]);

    // When timer expires (transitions from >0 to 0), auto-advance to next tab
    useEffect(() => {
        if (prevTimeLeftRef.current > 0 && timeLeft === 0) {
            // Timer just expired — advance to the next stage
            const nextStage = getNextStage();
            setActiveTab(nextStage);
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

        // Prevent auto-advancing to next tab
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

    const isReadOnly = !!student.headInjuryLogs.find(l => l.stage === activeTab);
    const hasYesSymptoms = Object.values(currentSymptoms).some(val => val === true);

    // "Monitoring" = viewing a completed tab while the timer is still running
    const isMonitoring = isReadOnly && timeLeft > 0;

    // Get the saved log for the current active tab to show results in summary
    const savedLog = student.headInjuryLogs.find(l => l.stage === activeTab);

    // Determine if all symptoms are "No"
    const allNo = savedLog ? Object.values(savedLog.symptoms).every(v => v === false) : false;

    // Determine which stage is currently "pending" (next to be done)
    const nextStage = getNextStage();

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: witnessDone ? 'minmax(550px, 1fr) minmax(500px, 1fr)' : '1fr',
            gap: '20px',
            maxHeight: '60vh',
            height: '60vh'
        }}>
            {/* LEFT COLUMN: Witness Statement / Summary + Buttons / Timer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {isMonitoring ? (
                    /* ===== SUMMARY BOX (replaces witness statement after saving) ===== */
                    <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '16px', border: '1px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

                        {/* Questionnaire Results */}
                        <div>
                            <div style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase' }}>
                                Assessment Results ({activeTab})
                            </div>
                            {allNo ? (
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> "No" to All Symptoms
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {savedLog && Object.entries(savedLog.symptoms).map(([symptom, val]) => (
                                        <div key={symptom} style={{ fontSize: '12px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: '700', color: val ? '#dc2626' : '#16a34a', fontSize: '11px', width: '14px' }}>{val ? 'Y' : 'N'}</span>
                                            <span style={{ fontWeight: '500' }}>{symptom}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submitted by footer */}
                        <div style={{ paddingTop: '12px', borderTop: '1px solid #ef444440', fontSize: '11px', color: '#991b1b', opacity: 0.9 }}>
                            Submitted by <span style={{ fontWeight: '700' }}>{student.headInjuryWitness || currentStaffName}</span> on {student.headInjuryTimestamp || 'Unknown Date'}
                        </div>
                    </div>
                ) : isReadOnly && savedLog ? (
                    /* ===== SUMMARY BOX for completed tabs when timer has expired (e.g. clicking back on 0min after it's done) ===== */
                    <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '16px', border: '1px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

                        {/* Questionnaire Results */}
                        <div>
                            <div style={{ fontSize: '11px', fontWeight: '800', color: '#991b1b', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase' }}>
                                Assessment Results ({activeTab})
                            </div>
                            {allNo ? (
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> "No" to All Symptoms
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {Object.entries(savedLog.symptoms).map(([symptom, val]) => (
                                        <div key={symptom} style={{ fontSize: '12px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: '700', color: val ? '#dc2626' : '#16a34a', fontSize: '11px', width: '14px' }}>{val ? 'Y' : 'N'}</span>
                                            <span style={{ fontWeight: '500' }}>{symptom}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submitted by footer */}
                        <div style={{ paddingTop: '12px', borderTop: '1px solid #ef444440', fontSize: '11px', color: '#991b1b', opacity: 0.9 }}>
                            Submitted by <span style={{ fontWeight: '700' }}>{savedLog.staffName || currentStaffName}</span> on {student.headInjuryTimestamp || 'Unknown Date'}
                        </div>
                    </div>
                ) : (
                    /* ===== ORIGINAL WITNESS STATEMENT (for new/editing) ===== */
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
                            WITNESS STATEMENT {student.headInjuryTimestamp && <span style={{ fontWeight: '400', fontSize: '13px' }}>• Reported by {student.headInjuryWitness || currentStaffName} at {student.headInjuryTimestamp}</span>}
                        </label>
                        <textarea
                            value={witnessText}
                            onChange={(e) => setWitnessText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && witnessText.trim() && !witnessDone) {
                                    e.preventDefault();
                                    handleWitnessDone();
                                }
                            }}
                            disabled={witnessDone}
                            placeholder="Describe how the injury occurred..."
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', minHeight: '120px', fontFamily: 'inherit', outline: 'none', resize: 'none' }}
                        />
                    </div>
                )}

                {/* Buttons area — replaced by timer when monitoring */}
                {isMonitoring ? (
                    /* ===== INLINE TIMER (replaces Cancel/Save buttons) ===== */
                    <div style={{ backgroundColor: 'var(--bg-app)', borderRadius: '8px', padding: '16px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Active Monitoring</div>
                        <div style={{ fontSize: '28px', fontWeight: '800', color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
                            {formatTimeWithMs(timeLeft)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Next assessment unlocks automatically</div>
                    </div>
                ) : (
                    <>
                        {!witnessDone && (
                            <>
                                <button onClick={handleCancelReport} style={{ padding: '14px', borderRadius: '8px', border: darkMode ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={handleWitnessDone} disabled={!witnessText.trim()} style={{ padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--color-danger)', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: witnessText.trim() ? 1 : 0.5 }}>Done</button>
                            </>
                        )}

                        {/* Action buttons shown directly below witness statement */}
                        {witnessDone && isLead && !isReadOnly && (
                            <div style={{ display: 'flex', gap: '12px' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflow: 'hidden' }}>
                    {/* Time-based pills (like main page filters) */}
                    {isLead && (
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            {(['0min', '15min', '30min'] as const).map(stage => {
                                const isDone = student.headInjuryLogs.some(l => l.stage === stage);
                                const isActive = activeTab === stage;
                                // A tab is clickable if: it's done (can review), or it's the current pending stage and timer is expired
                                const isClickable = isDone || stage === nextStage;
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

                    {/* Scrollable questionnaire with fixed height — grayed out when viewing a completed tab */}
                    <div style={{ flex: '1', overflowY: 'scroll', opacity: isReadOnly ? 0.4 : ((surveyCompleted && !isReadOnly) ? 0.6 : 1), pointerEvents: isReadOnly ? 'none' : ((surveyCompleted && !isReadOnly) ? 'none' : 'auto'), display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '8px', border: '1px solid var(--border-subtle)' }}>
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

                    {/* Done button at bottom of right column (only when issues found) */}
                    {isLead && !isReadOnly && !isMonitoring && hasYesSymptoms && !surveyCompleted && (
                        <button onClick={handleYesDone} style={{ width: '100%', padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', flexShrink: 0 }}>Done (Issues Found)</button>
                    )}
                </div>
            )}
        </div>
    );
};

export default HeadInjuryChecklist;
