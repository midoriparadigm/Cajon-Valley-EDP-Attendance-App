// src/components/ParentReportModal.tsx
import React, { useState } from 'react';
import type { Student, ParentReport } from '../types';

interface ParentReportModalProps {
    student: Student;
    type: 'injury' | 'behavior';
    onClose: () => void;
    onSend: (report: ParentReport) => void;
    onSaveDraft: (report: ParentReport) => void;
    staffId: string;
    existingReport?: ParentReport;
}

const ParentReportModal = (props: ParentReportModalProps) => {
    const { student, type, onClose, onSend, onSaveDraft, staffId, existingReport } = props;
    const [method, setMethod] = useState<'email' | 'sms' | 'both'>(existingReport?.method || 'both');

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

            return `Dear ${(student.guardians?.[0]?.firstName || 'Unknown')} ${(student.guardians?.[0]?.lastName || '')},

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
            const ticketLevel = student.behavior === 'green' ? 'Level 1 (Green)' : 'None';
            const behaviorList = student.behaviorIssues.length > 0
                ? student.behaviorIssues.map(b => `• ${b}`).join('\n')
                : '• General behavior concern';

            return `Dear ${(student.guardians?.[0]?.firstName || 'Unknown')} ${(student.guardians?.[0]?.lastName || '')},

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

    const [message, setMessage] = useState(existingReport?.message || generateMessage());

    const createReport = (status: 'draft' | 'sent'): ParentReport => ({
        id: existingReport?.id || Date.now().toString(),
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        type,
        behaviorLevel: type === 'behavior' ? (student.behavior === 'green' ? 'green' : undefined) : undefined,
        message,
        method,
        status,
        createdAt: existingReport?.createdAt || new Date().toISOString(),
        staffId: staffId || 'unknown'
    });

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>Parent Report Draft</h3>
                    <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: type === 'injury' ? '#fef2f2' : student.behavior === 'green' ? '#dcfce7' : '#f3f4f6', color: type === 'injury' ? '#dc2626' : student.behavior === 'green' ? '#16a34a' : '#6b7280' }}>
                        {type === 'injury' ? 'Head Injury' : 'Behavior Ticket'}
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

export default ParentReportModal;
