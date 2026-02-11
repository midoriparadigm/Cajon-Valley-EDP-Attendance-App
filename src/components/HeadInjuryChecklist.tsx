// src/components/HeadInjuryChecklist.tsx
import React, { useState, useEffect } from 'react';
import type { Student, HeadInjuryLog } from '../types';
import { HEAD_INJURY_SYMPTOMS } from '../constants';

interface HeadInjuryChecklistProps {
    student: Student;
    onUpdate: (updates: Partial<Student>, logs?: HeadInjuryLog[]) => void;
    currentStaffName: string;
    isLead: boolean;
    darkMode: boolean;
}

const HeadInjuryChecklist = ({ student, onUpdate, currentStaffName, isLead, darkMode }: HeadInjuryChecklistProps) => {
    const [activeTab, setActiveTab] = useState<'0min' | '15min' | '30min'>('0min');
    const [currentSymptoms, setCurrentSymptoms] = useState<Record<string, boolean>>({});
    const [notes, setNotes] = useState('');
    const [surveyCompleted, setSurveyCompleted] = useState(false);
    const [showNewReportForm, setShowNewReportForm] = useState(!student.headInjury);
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



    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: witnessDone ? 'minmax(550px, 1fr) minmax(500px, 1fr)' : '1fr',
            gap: '20px',
            maxHeight: '70vh',
            height: '70vh'
        }}>
            {/* LEFT COLUMN: Witness Statement + Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
                        Witness Statement {student.headInjuryTimestamp && <span style={{ fontWeight: '400', fontSize: '13px' }}>• Reported by {student.headInjuryWitness || currentStaffName} at {student.headInjuryTimestamp}</span>}
                    </label>
                    <textarea
                        value={witnessText}
                        onChange={(e) => setWitnessText(e.target.value)}
                        disabled={witnessDone}
                        placeholder="Describe how the injury occurred..."
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '14px', minHeight: '120px', fontFamily: 'inherit', outline: 'none', resize: 'none' }}
                    />
                </div>

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
                        <button onClick={handleNoToAll} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>"No" to All</button>
                    </div>
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
                                return (
                                    <button
                                        key={stage}
                                        onClick={() => {
                                            if (isDone) {
                                                setActiveTab(stage);
                                                const savedLog = student.headInjuryLogs.find(l => l.stage === stage);
                                                if (savedLog) {
                                                    setCurrentSymptoms(savedLog.symptoms);
                                                }
                                            }
                                        }}
                                        disabled={!isDone && activeTab !== stage}
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            borderRadius: '12px',
                                            border: 'none',
                                            backgroundColor: isActive ? 'var(--text-main)' : (darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb'),
                                            color: isActive ? 'var(--bg-card)' : (darkMode ? 'rgba(255,255,255,0.7)' : 'var(--text-main)'),
                                            opacity: (!isDone && activeTab !== stage) ? 0.5 : 1,
                                            fontWeight: '800',
                                            fontSize: '14px',
                                            cursor: (isDone || activeTab === stage) ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {stage} {isDone && '✓'}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Scrollable questionnaire with fixed height */}
                    <div style={{ flex: '1', overflowY: 'scroll', opacity: (surveyCompleted && !isReadOnly) || (activeTab !== '0min' && student.headInjuryLogs.find(l => l.stage === activeTab)) ? 0.6 : 1, pointerEvents: (surveyCompleted && !isReadOnly) || (activeTab !== '0min' && student.headInjuryLogs.find(l => l.stage === activeTab)) ? 'none' : 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '8px', border: '1px solid var(--border-subtle)' }}>
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
                                                    disabled={isReadOnly || (activeTab !== '0min' && student.headInjuryLogs.find(l => l.stage === activeTab))}
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
                                                    disabled={isReadOnly || (activeTab !== '0min' && student.headInjuryLogs.find(l => l.stage === activeTab))}
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

                    {/* Save/Done buttons at bottom of right column */}
                    {isLead && !isReadOnly && hasYesSymptoms && !surveyCompleted && (
                        <button onClick={handleYesDone} style={{ width: '100%', padding: '14px', backgroundColor: 'var(--color-danger)', border: 'none', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', flexShrink: 0 }}>Done (Issues Found)</button>
                    )}

                    {isLead && !isReadOnly && surveyCompleted && (
                        <button onClick={handleSaveLog} style={{ width: '100%', padding: '14px', backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', flexShrink: 0 }}>Save Assessment</button>
                    )}
                </div>
            )}
        </div>
    );
};

export default HeadInjuryChecklist;
