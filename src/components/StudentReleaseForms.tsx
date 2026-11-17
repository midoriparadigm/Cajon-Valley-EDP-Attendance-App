// src/components/StudentReleaseForms.tsx — The Early Release Form tile on a student's page
//
// Everyone at the door can see whether a student may leave early today and
// why. Leads can also act on the form from here (send the link, countersign,
// mark it entered); a student's first form is started from Leader Dashboard →
// Early Release Forms, where the school, cycle and program hours are set.
import React, { useEffect } from 'react';
import type { Student } from '../types';
import { currentForms, formatReleaseTime, reasonLabel, releaseOn } from '../utils/releaseForms';
import { loadReleaseForms, useReleaseForms } from '../services/releaseForms';
import ReleaseFormDetail from './ReleaseFormDetail';

interface StudentReleaseFormsProps {
    student: Student;
    canAct: boolean;
    staffName: string;
    showToast: (msg: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

const StudentReleaseForms = ({ student, canAct, staffName, showToast }: StudentReleaseFormsProps) => {
    const forms = useReleaseForms();
    useEffect(() => { void loadReleaseForms(); }, []);

    const mine = forms.filter(f => f.studentId === student.id);
    const current = currentForms(forms).filter(f => f.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const replaced = mine.filter(f => !current.includes(f));
    const today = releaseOn(forms, student.id);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '14px', backgroundColor: today ? '#cffafe' : 'var(--bg-card)', border: `1px solid ${today ? '#67e8f9' : 'var(--border-subtle)'}`, color: today ? '#155e75' : 'var(--text-main)' }}>
                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '28px' }}>{today ? 'directions_walk' : 'schedule'}</span>
                <div>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>{today ? `Approved to leave at ${formatReleaseTime(today.time)} today` : 'No early release today'}</div>
                    <div style={{ fontSize: '13px' }}>
                        {today
                            ? `Reason ${reasonLabel(today.row.reasonCode)} · ${today.form.cycle}`
                            : current.length === 0 ? 'No Early Release Form on file.' : `${student.firstName} stays for the full program today.`}
                    </div>
                </div>
            </div>

            {current.length === 0 && (
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {canAct
                        ? 'To send this family the form, open Leader Dashboard → Early Release Forms.'
                        : 'A Lead sends the form to the family from the Leader Dashboard.'}
                </p>
            )}

            {current.map(form => (
                <section key={form.id} aria-label={`Early Release Form, ${form.cycle}`}>
                    {current.length > 1 && <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>{form.cycle}</h4>}
                    <ReleaseFormDetail form={form} student={student} canAct={canAct} staffName={staffName} showToast={showToast} />
                </section>
            ))}

            {replaced.length > 0 && (
                <details>
                    <summary style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>Replaced forms ({replaced.length}) · kept for the record</summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                        {replaced.map(form => <ReleaseFormDetail key={form.id} form={form} student={student} canAct={false} staffName={staffName} showToast={showToast} />)}
                    </div>
                </details>
            )}
        </div>
    );
};

export default StudentReleaseForms;
