// src/components/ReleaseFormDetail.tsx — One Early Release Form, as staff see it
//
// Shows the form the way the paper one reads (student, date ranges with both
// signatures, the agreement, the site-use box) plus everything that happened
// to it, with times. A Lead also acts from here: send the family their link,
// countersign, record a paper form, and mark date ranges as entered into
// Cityspan. Everything adds to the record; nothing here edits it.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReleaseForm, ReleaseLink, Student } from '../types';
import { RELEASE_FORM_TEXT } from '../utils/releaseFormText';
import {
    activeRows, agreementSignature, currentForms, describeTimes, formStatus, formTimeline, formatReleaseDate, formatSignedAt,
    openLink, reasonLabel, rowEntry, rowSignature, rowsToEnter, type ReleaseStatus,
} from '../utils/releaseForms';
import {
    countersignReleaseForm, loadReleaseForms, logPaperReleaseForm, markReleaseRowsEntered, releaseLinkUrl, replaceReleaseForm,
    sendReleaseLink, useReleaseForms,
} from '../services/releaseForms';
import { localDateIso } from '../utils/helpers';
import { GuardianReleaseFormForLink } from './GuardianReleaseForm';
import { ReleaseRowsEditor, SignatureMark, draftProblem, draftToInput, type RowDraft } from './ReleaseFormParts';
import ConfirmDialog from './ConfirmDialog';

type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ReleaseFormDetailProps {
    form: ReleaseForm;
    /** The student on the current roster, for the family's contact details. */
    student?: Student;
    /** Leads send, countersign and record; other staff only read. */
    canAct: boolean;
    staffName: string;
    showToast: (msg: string, type: ToastType) => void;
}

export const RELEASE_STATUS_STYLE: Record<ReleaseStatus, { label: string; fg: string; bg: string; icon: string }> = {
    not_sent: { label: 'Not sent', fg: 'var(--text-secondary)', bg: 'var(--bg-hover)', icon: 'drafts' },
    waiting: { label: 'Waiting for parent', fg: '#1d4ed8', bg: '#dbeafe', icon: 'hourglass_top' },
    expired: { label: 'Link expired', fg: '#92400e', bg: 'var(--color-warning-bg)', icon: 'timer_off' },
    to_countersign: { label: 'Needs staff signature', fg: '#92400e', bg: 'var(--color-warning-bg)', icon: 'edit_note' },
    signed: { label: 'Signed and locked', fg: '#047857', bg: 'var(--color-success-bg)', icon: 'lock' },
};

export const ReleaseStatusChip = ({ status, label }: { status: ReleaseStatus; label?: string }) => {
    const s = RELEASE_STATUS_STYLE[status];
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', backgroundColor: s.bg, color: s.fg, fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '14px' }}>{s.icon}</span>{label ?? s.label}
        </span>
    );
};

/** "VT" from "Veronica Thomas (EDP)". */
const initialsOf = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).filter(Boolean).map(p => p[0]!.toUpperCase()).join('');

const card: React.CSSProperties = { backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', padding: '16px', boxShadow: 'var(--shadow-sm)' };
const heading: React.CSSProperties = { margin: '0 0 10px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' };
const button = (primary?: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px 16px', borderRadius: '12px',
    border: primary ? 'none' : '1px solid var(--border-subtle)', backgroundColor: primary ? 'var(--color-primary)' : 'var(--bg-card)',
    color: primary ? '#fff' : 'var(--text-main)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
});
const field: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '16px', fontFamily: 'inherit', boxSizing: 'border-box' };
const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 };

const ReleaseFormDetail = ({ form, student, canAct, staffName, showToast }: ReleaseFormDetailProps) => {
    const allForms = useReleaseForms();
    const [busy, setBusy] = useState(false);
    const [panel, setPanel] = useState<'countersign' | 'paper' | null>(null);
    /** The link sent from this screen, whose token is known here (the database keeps only a hash). */
    const [sentToken, setSentToken] = useState<{ linkId: string; token: string } | null>(null);
    const [previewToken, setPreviewToken] = useState<string | null>(null);
    const [confirmReplace, setConfirmReplace] = useState(false);

    // Countersign
    const [initials, setInitials] = useState(() => initialsOf(staffName));
    const [staffConsent, setStaffConsent] = useState(false);
    // Paper form
    const [paperRows, setPaperRows] = useState<RowDraft[]>([]);
    const [paperName, setPaperName] = useState('');
    const [paperDate, setPaperDate] = useState(() => localDateIso());
    const [paperTried, setPaperTried] = useState(false);

    const status = formStatus(form);
    const isCurrent = currentForms(allForms).some(f => f.id === form.id);
    const rows = activeRows(form);
    const replacedRows = form.rows.filter(r => !rows.includes(r));
    const guardian = agreementSignature(form, 'guardian');
    const staff = agreementSignature(form, 'staff');
    const link = openLink(form);
    const toEnter = rowsToEnter(form);
    const contact = student?.guardians.find(g => g.type === 'Contact 1');
    const contactName = contact ? `${contact.firstName} ${contact.lastName}` : undefined;
    const act = canAct && isCurrent;

    /** The token for the open link, if this device has it. */
    const tokenFor = (l: ReleaseLink | undefined): string | undefined =>
        !l ? undefined : l.token ?? (sentToken?.linkId === l.id ? sentToken.token : undefined);
    const openToken = tokenFor(link);

    const run = async (work: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try { await work(); } finally { setBusy(false); }
    };

    const send = (channel: 'sms' | 'email') => run(async () => {
        const to = channel === 'sms' ? contact?.phone : contact?.email;
        if (!to) return;
        const sent = await sendReleaseLink(form, channel, to, staffName);
        if (!sent) { showToast("Link not sent — couldn't save it to the database", 'error'); return; }
        setSentToken({ linkId: sent.link.id, token: sent.token });
        showToast(`Link ${channel === 'sms' ? 'texted' : 'emailed'} to ${contactName ?? to} (simulated)`, 'success');
    });

    const countersign = () => run(async () => {
        const ok = await countersignReleaseForm(form, staffName, initials.trim());
        if (!ok) { showToast("Not countersigned — couldn't save to the database", 'error'); return; }
        setPanel(null);
        setStaffConsent(false);
        showToast('Countersigned. The form is locked.', 'success');
    });

    const savePaper = () => run(async () => {
        setPaperTried(true);
        if (!paperName.trim() || !paperDate || paperRows.some(d => draftProblem(d))) return;
        if (guardian && paperRows.length === 0) return;
        const ok = await logPaperReleaseForm(form, { rows: paperRows.map(draftToInput), signerName: paperName, signedOn: paperDate });
        if (!ok) { showToast("Paper form not saved — couldn't save to the database", 'error'); return; }
        setPanel(null); setPaperRows([]); setPaperName(''); setPaperTried(false);
        showToast('Paper form recorded. Countersign it to finish.', 'success');
    });

    const markEntered = (rowIds: string[]) => run(async () => {
        const ok = await markReleaseRowsEntered(form, rowIds, staffName);
        showToast(ok ? 'Marked as entered into Cityspan' : "Not saved — couldn't reach the database", ok ? 'success' : 'error');
    });

    const replace = () => run(async () => {
        setConfirmReplace(false);
        if (!student) return;
        const next = await replaceReleaseForm(form, student, staffName);
        showToast(next ? 'New blank form started. The old one is kept for the record.' : "Not replaced — couldn't save to the database", next ? 'success' : 'error');
    });

    const copyLink = async (token: string) => {
        try {
            await navigator.clipboard.writeText(releaseLinkUrl(token));
            showToast('Link copied', 'success');
        } catch {
            showToast("Couldn't copy the link on this device", 'warning');
        }
    };

    const signatureLine = (label: string, sig: ReturnType<typeof agreementSignature>, pendingText: string) => (
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>{label}</span>
            {sig ? (
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-main)' }}><SignatureMark signature={sig} height={34} /></div>
                    <div style={small}>{sig.signerName} · {formatSignedAt(sig.signedAt)}</div>
                </div>
            ) : <span style={{ ...small, fontStyle: 'italic' }}>{pendingText}</span>}
        </div>
    );

    const facts: [string, React.ReactNode][] = [
        ['Student', <strong key="s">{form.studentName}</strong>], ['Grade', form.grade], ['School', form.siteName],
        ['Program hours', form.programHours], ['Program cycle', form.cycle], ['Form', `2026-2027 Elementary School Early Release Form · ${form.formVersion}`],
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* The form's header */}
            <section style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <ReleaseStatusChip status={status} />
                    <span style={{ ...small, fontWeight: 700, color: form.localOnly ? '#92400e' : 'var(--text-secondary)' }}>
                        {!isCurrent ? 'Replaced by a newer form · kept for the record' : form.localOnly ? 'On this device only · not saved' : 'Saved to the database'}
                    </span>
                </div>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '14px' }}>
                    {facts.map(([label, value]) => (
                        <React.Fragment key={label}>
                            <dt style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</dt>
                            <dd style={{ margin: 0, color: 'var(--text-main)' }}>{value}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            </section>

            {/* What needs doing next */}
            {act && status === 'to_countersign' && panel !== 'countersign' && (
                <section style={{ ...card, borderColor: 'var(--color-warning)' }}>
                    <h3 style={heading}>Your turn</h3>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-main)' }}>
                        {staff
                            ? 'The family added or changed date ranges. Review them below, then countersign to approve them.'
                            : `${guardian?.signerName ?? 'The family'} signed ${guardian ? formatSignedAt(guardian.signedAt) : ''}. Review the date ranges below, then countersign to approve and lock the form.`}
                    </p>
                    <button type="button" onClick={() => setPanel('countersign')} style={button(true)}>
                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>draw</span>Countersign
                    </button>
                </section>
            )}

            {act && panel === 'countersign' && (
                <section style={{ ...card, borderColor: 'var(--color-primary)' }}>
                    <h3 style={heading}>Countersign as {staffName}</h3>
                    <label style={{ display: 'block', marginBottom: '12px' }}>
                        <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Your initials (go next to each date range)</span>
                        <input type="text" value={initials} maxLength={6} onChange={e => setInitials(e.target.value)} style={{ ...field, maxWidth: '140px' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
                        <input type="checkbox" checked={staffConsent} onChange={e => setStaffConsent(e.target.checked)} style={{ width: '20px', height: '20px', marginTop: '1px', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-main)' }}>I have reviewed this request and sign it electronically. The date and time are recorded automatically.</span>
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={countersign} disabled={busy || !staffConsent || !initials.trim()} style={{ ...button(true), backgroundColor: 'var(--color-success)', opacity: busy || !staffConsent || !initials.trim() ? 0.5 : 1 }}>
                            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>lock</span>Sign and lock
                        </button>
                        <button type="button" onClick={() => setPanel(null)} style={button()}>Cancel</button>
                    </div>
                </section>
            )}

            {/* The family's link (out of the way while a signature is waiting for staff) */}
            {act && status !== 'to_countersign' && (
                <section style={card}>
                    <h3 style={heading}>{guardian ? 'Add or change dates' : 'Send to the family'}</h3>
                    {link ? (
                        <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-main)' }}>
                            Link {link.channel === 'sms' ? 'texted' : 'emailed'} to <strong>{link.sentTo}</strong> {formatSignedAt(link.sentAt)}. It works once and expires {new Date(link.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}.
                        </p>
                    ) : (
                        <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-main)' }}>
                            {guardian
                                ? 'Send a new link for the family to add a date range or change one. What they already signed stays on the form.'
                                : `${contactName ?? 'The primary contact'} gets a single-use link, fills in any early release dates and signs on their phone. No account needed.`}
                        </p>
                    )}
                    {!student ? (
                        <p style={{ ...small, fontWeight: 700 }}>This student is not on the current roster, so there is no contact to send to.</p>
                    ) : (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => send('sms')} disabled={busy || !contact?.phone} title={contact?.phone ? undefined : 'No phone number for Contact 1'} style={{ ...button(!link), opacity: busy || !contact?.phone ? 0.5 : 1 }}>
                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>sms</span>{link ? 'Text a new link' : 'Text the link'}{contact?.phone ? ` · ${contact.phone}` : ''}
                            </button>
                            <button type="button" onClick={() => send('email')} disabled={busy || !contact?.email} title={contact?.email ? undefined : 'No email address for Contact 1'} style={{ ...button(), opacity: busy || !contact?.email ? 0.5 : 1 }}>
                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>mail</span>{contact?.email ? `Email it · ${contact.email}` : 'Email it (no address on file)'}
                            </button>
                        </div>
                    )}

                    {link && (
                        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '12px', backgroundColor: 'var(--color-warning-bg)', color: '#92400e' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: openToken ? '10px' : 0 }}>
                                Texts and emails are simulated in this build, so nothing actually reached the family.
                                {openToken ? ' To show the parent\'s side:' : ' Send a new link to open the parent\'s side from here.'}
                            </div>
                            {openToken && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => setPreviewToken(openToken)} style={button(true)}>
                                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>smartphone</span>Open the parent's view
                                    </button>
                                    {!form.localOnly && (
                                        <button type="button" onClick={() => copyLink(openToken)} style={button()}>
                                            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>content_copy</span>Copy the link (open it on any phone)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {panel !== 'paper' && (
                        <button type="button" onClick={() => { setPanel('paper'); setPaperTried(false); }} style={{ marginTop: '14px', padding: 0, border: 'none', background: 'none', color: 'var(--color-primary-hover)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                            The family signed on paper? Record the paper form
                        </button>
                    )}
                </section>
            )}

            {act && panel === 'paper' && (
                <section style={{ ...card, borderColor: 'var(--color-primary)' }}>
                    <h3 style={heading}>Record a paper form</h3>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-main)' }}>
                        Copy the date ranges from the paper form. Keep the paper: this entry says it was signed on paper and who recorded it.
                        {!guardian && ' Leave out date ranges if the family is staying for the full program.'}
                    </p>
                    <ReleaseRowsEditor drafts={paperRows} onChange={setPaperRows} text={RELEASE_FORM_TEXT.en} showProblems={paperTried} startAt={rows.length + 1} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
                        <label>
                            <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Parent/guardian name as signed</span>
                            <input type="text" value={paperName} maxLength={120} onChange={e => setPaperName(e.target.value)} style={field} />
                        </label>
                        <label>
                            <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Date next to the signature</span>
                            <input type="date" value={paperDate} max={localDateIso()} onChange={e => setPaperDate(e.target.value)} style={field} />
                        </label>
                    </div>
                    {paperTried && (!paperName.trim() || !paperDate || (!!guardian && paperRows.length === 0)) && (
                        <div role="alert" style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>
                            {!paperName.trim() ? "Enter the parent's or guardian's name." : !paperDate ? 'Enter the date on the form.' : 'Add at least one date range.'}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={savePaper} disabled={busy} style={{ ...button(true), opacity: busy ? 0.5 : 1 }}>Save paper form</button>
                        <button type="button" onClick={() => setPanel(null)} style={button()}>Cancel</button>
                    </div>
                </section>
            )}

            {/* Authorization for Early Release: the date ranges */}
            <section style={card}>
                <h3 style={heading}>Authorization for early release</h3>
                {rows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {guardian ? 'No early release requested: the student stays for the full program.' : 'No date ranges yet. The family adds them when they sign.'}
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rows.map(row => {
                            const g = rowSignature(form, row.id, 'guardian');
                            const s = rowSignature(form, row.id, 'staff');
                            const entry = rowEntry(form, row.id);
                            return (
                                <li key={row.id} style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>{formatReleaseDate(row.dateFrom)} – {formatReleaseDate(row.dateTo)}</div>
                                    <div style={{ fontSize: '14px', color: 'var(--text-main)', margin: '2px 0 4px' }}>Reason {reasonLabel(row.reasonCode)} · {describeTimes(row.times)}</div>
                                    {signatureLine('Parent', g, 'Not signed')}
                                    {signatureLine('Staff', s, 'Waiting for countersignature')}
                                    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '10px', alignItems: 'center', padding: '8px 0 0', borderTop: '1px solid var(--border-subtle)' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>Cityspan</span>
                                        {entry ? (
                                            <span style={small}>Entered by {entry.enteredBy} · {formatSignedAt(entry.enteredAt)}</span>
                                        ) : s && act ? (
                                            <button type="button" onClick={() => markEntered([row.id])} disabled={busy} style={{ ...button(), padding: '8px 12px', fontSize: '13px', justifySelf: 'start' }}>
                                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '16px' }}>task_alt</span>Mark as entered into Cityspan
                                            </button>
                                        ) : <span style={{ ...small, fontStyle: 'italic' }}>{s ? 'Not entered yet' : 'After countersignature'}</span>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {act && toEnter.length > 1 && (
                    <button type="button" onClick={() => markEntered(toEnter.map(r => r.id))} disabled={busy} style={{ ...button(), marginTop: '12px' }}>
                        Mark all {toEnter.length} as entered into Cityspan
                    </button>
                )}
                {replacedRows.length > 0 && (
                    <details style={{ marginTop: '12px' }}>
                        <summary style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>Replaced date ranges ({replacedRows.length}) · kept for the record</summary>
                        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {replacedRows.map(row => (
                                <li key={row.id} style={{ textDecoration: 'line-through' }}>{formatReleaseDate(row.dateFrom)} – {formatReleaseDate(row.dateTo)} · Reason {reasonLabel(row.reasonCode)} · {describeTimes(row.times)}</li>
                            ))}
                        </ul>
                    </details>
                )}
            </section>

            {/* The agreement */}
            <section style={card}>
                <h3 style={heading}>ASES early release authorization agreement</h3>
                {signatureLine('Parent', guardian, 'Not signed yet')}
                {signatureLine('Staff', staff, 'Waiting for countersignature')}
                <details style={{ marginTop: '10px' }}>
                    <summary style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>Read the form's wording</summary>
                    <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-main)' }}>
                        <p style={{ margin: '0 0 8px' }}><strong>{RELEASE_FORM_TEXT.en.policyHeading}.</strong> {RELEASE_FORM_TEXT.en.policy}</p>
                        <p style={{ margin: '0 0 8px' }}><strong>{RELEASE_FORM_TEXT.en.studentsHeading}.</strong> {RELEASE_FORM_TEXT.en.students}</p>
                        <p style={{ margin: 0 }}><strong>{RELEASE_FORM_TEXT.en.agreementSubheading}.</strong> {RELEASE_FORM_TEXT.en.agreement}</p>
                    </div>
                </details>
            </section>

            {/* Everything that happened, with times */}
            <section style={card}>
                <h3 style={heading}>Record</h3>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {formTimeline(form).map((item, i) => (
                        <li key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: '10px' }}>
                            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '20px', color: 'var(--text-secondary)' }}>{item.icon}</span>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>{item.title}</div>
                                <div style={small}>{formatSignedAt(item.at)}{item.detail ? ` · ${item.detail}` : ''}</div>
                            </div>
                        </li>
                    ))}
                </ol>
                {act && student && guardian && (
                    <button type="button" onClick={() => setConfirmReplace(true)} style={{ marginTop: '14px', padding: 0, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                        Something on this form is wrong? Start a corrected form
                    </button>
                )}
            </section>

            {confirmReplace && (
                <ConfirmDialog title="Start a corrected form?" confirmLabel="Start new form" confirmColor="var(--color-primary)" onConfirm={replace} onCancel={() => setConfirmReplace(false)}>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                        A new blank form for {form.studentName} replaces this one, and the family signs again. This form stays in the record, marked as replaced.
                    </p>
                </ConfirmDialog>
            )}

            {previewToken && createPortal(
                <div role="dialog" aria-modal="true" aria-label="The parent's view" style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(15,23,42,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 'env(safe-area-inset-top)' }}>
                    <div style={{ width: '100%', maxWidth: '460px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', color: '#fff' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>
                            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '16px', verticalAlign: '-3px', marginRight: '6px' }}>smartphone</span>
                            What the family sees on their phone
                        </span>
                        <button type="button" onClick={() => { setPreviewToken(null); void loadReleaseForms(); }} style={{ ...button(), padding: '8px 12px' }}>Close</button>
                    </div>
                    <div style={{ flex: 1, width: '100%', maxWidth: '460px', overflowY: 'auto', backgroundColor: 'var(--bg-app)', borderRadius: '24px 24px 0 0' }}>
                        <GuardianReleaseFormForLink token={previewToken} source={form.localOnly ? 'device' : 'database'} onSigned={() => { void loadReleaseForms(); }} />
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export default ReleaseFormDetail;
