// src/components/GuardianReleaseForm.tsx — The parent's side of the Early Release Form
//
// What a guardian sees when they open the link from their text or email: the
// district's form (policy, student, program hours), their date ranges, the
// agreement, and one place to sign. One sitting signs every date range and
// the agreement. No account and no login — the single-use link is the key.
//
// The same component is the in-app "parent's view" staff open to demonstrate
// the flow, or when a form is kept on the staff device only.
import React, { useEffect, useRef, useState } from 'react';
import type { ReleaseLanguage } from '../types';
import { RELEASE_FORM_TEXT, RELEASE_LANGUAGES } from '../utils/releaseFormText';
import { describeTimes, formatReleaseDate, formatSignedAt, isSignaturePath } from '../utils/releaseForms';
import {
    openGuardianForm, submitGuardianForm, releaseTokenFromLocation,
    type GuardianFormData, type GuardianLoad, type GuardianResult, type GuardianSubmit, type LinkProblem, type LinkSource,
} from '../services/releaseForms';
import { isSupabaseConfigured } from '../supabaseClient';
import { ReleaseRowsEditor, SignaturePad, TypedSignaturePreview, draftProblem, draftToInput, newRowDraft, type RowDraft } from './ReleaseFormParts';

interface GuardianReleaseFormProps {
    load: () => Promise<GuardianLoad>;
    submit: (input: GuardianSubmit) => Promise<GuardianResult>;
    /** Called once the form is signed (the staff preview closes itself with it). */
    onSigned?: () => void;
}

const card: React.CSSProperties = { backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', padding: '18px', boxShadow: 'var(--shadow-sm)' };
const h2: React.CSSProperties = { margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' };
const body: React.CSSProperties = { margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)' };
const fieldStyle: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '16px', fontFamily: 'inherit', boxSizing: 'border-box' };

const GuardianReleaseForm = ({ load, submit, onSigned }: GuardianReleaseFormProps) => {
    const [language, setLanguage] = useState<ReleaseLanguage>(() => (navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'));
    const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; form: GuardianFormData } | { status: LinkProblem | 'invalid' }>({ status: 'loading' });
    /** First signing only: stays the full program, or needs early release. */
    const [needsEarly, setNeedsEarly] = useState<boolean | null>(null);
    const [drafts, setDrafts] = useState<RowDraft[]>([]);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<'typed' | 'drawn'>('typed');
    const [drawn, setDrawn] = useState('');
    const [consented, setConsented] = useState(false);
    const [tried, setTried] = useState(false);
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [signedAt, setSignedAt] = useState<string | null>(null);
    const problemRef = useRef<HTMLDivElement>(null);

    const text = RELEASE_FORM_TEXT[language];
    const ui = text.ui;

    useEffect(() => {
        let cancelled = false;
        load().then(result => {
            if (cancelled) return;
            setState(result);
            // Adding to a signed form starts with one blank date range.
            if (result.status === 'ok' && result.form.agreementSigned) setDrafts([newRowDraft()]);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const languagePicker = (
        <div role="group" aria-label="Language / Idioma" style={{ display: 'flex', gap: '6px' }}>
            {RELEASE_LANGUAGES.map(l => (
                <button key={l.id} type="button" lang={l.id} aria-pressed={language === l.id} onClick={() => setLanguage(l.id)} style={{ padding: '8px 12px', borderRadius: '999px', border: language === l.id ? '1.5px solid var(--text-main)' : '1px solid var(--border-subtle)', backgroundColor: language === l.id ? 'var(--text-main)' : 'var(--bg-card)', color: language === l.id ? 'var(--bg-card)' : 'var(--text-main)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{l.label}</button>
            ))}
        </div>
    );

    const shell = (children: React.ReactNode) => (
        <div lang={language} style={{ maxWidth: '620px', margin: '0 auto', padding: '16px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.4px', color: 'var(--text-secondary)' }}>EDP · Cajon Valley Union School District</div>
                {languagePicker}
            </header>
            {children}
        </div>
    );

    if (state.status === 'loading') return shell(<div role="status" style={{ ...card, textAlign: 'center', color: 'var(--text-secondary)' }}>{ui.link.loading}</div>);

    if (signedAt) {
        return shell(
            <div role="status" style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '56px', color: 'var(--color-success)' }}>check_circle</span>
                <h1 style={{ margin: '8px 0', fontSize: '22px', fontWeight: 800, color: 'var(--text-main)' }}>{ui.doneHeading}</h1>
                <p style={body}>{ui.done(formatSignedAt(signedAt))}</p>
                <p style={{ ...body, color: 'var(--text-secondary)', marginTop: '8px' }}>{ui.doneNext}</p>
            </div>,
        );
    }

    if (state.status !== 'ok') {
        const message = state.status === 'not_found' ? ui.link.notFound : state.status === 'used' ? ui.link.used
            : state.status === 'expired' ? ui.link.expired : state.status === 'replaced' ? ui.link.replaced : ui.link.error;
        return shell(
            <div role="alert" style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>link_off</span>
                <h1 style={{ margin: '8px 0', fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>{message}</h1>
                {state.status !== 'error' && <p style={{ ...body, color: 'var(--text-secondary)' }}>{ui.link.contact}</p>}
            </div>,
        );
    }

    const form = state.form;
    const adding = form.agreementSigned;
    // Signed date ranges the guardian has chosen to change are shown inside their replacement instead.
    const replacing = new Set(drafts.map(d => d.supersedes).filter(Boolean));
    const showRows = adding || needsEarly === true;
    const rows = showRows ? drafts : [];

    const problem: string | null =
        !adding && needsEarly === null ? ui.yourDates
        : showRows && rows.length === 0 ? ui.errors.nothing
        : rows.some(d => draftProblem(d)) ? ui.errors[rows.map(draftProblem).find(Boolean)!]
        : !name.trim() ? ui.errors.name
        : kind === 'drawn' && !isSignaturePath(drawn) ? ui.errors.draw
        : !consented ? ui.errors.consent
        : null;

    const send = async () => {
        setTried(true);
        setFailed(false);
        if (problem) {
            requestAnimationFrame(() => problemRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
            return;
        }
        setSending(true);
        const result = await submit({
            rows: rows.map(draftToInput), signerName: name.trim(), kind,
            signature: kind === 'drawn' ? drawn : name.trim(), consented, language,
        });
        setSending(false);
        if (result.status === 'signed') { setSignedAt(result.signedAt); onSigned?.(); }
        else if (result.status === 'invalid' || result.status === 'error') setFailed(true);
        else setState({ status: result.status });
    };

    const facts: [string, string][] = [
        [ui.student, form.studentName], [ui.grade, form.grade], [ui.school, form.siteName],
        [ui.programHours, form.programHours], [ui.cycle, form.cycle],
    ];

    return shell(
        <>
            <div style={card}>
                <h1 style={{ margin: '0 0 12px', fontSize: '21px', fontWeight: 800, lineHeight: 1.25, color: 'var(--text-main)' }}>{text.title}</h1>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '14px' }}>
                    {facts.map(([label, value]) => (
                        <React.Fragment key={label}>
                            <dt style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</dt>
                            <dd style={{ margin: 0, color: 'var(--text-main)', fontWeight: label === ui.student ? 800 : 500 }}>{value}</dd>
                        </React.Fragment>
                    ))}
                </dl>
                <p style={{ ...body, fontSize: '13px', color: 'var(--text-secondary)', marginTop: '12px' }}>{ui.expires(new Date(form.expiresAt).toLocaleDateString(language, { month: 'long', day: 'numeric' }))}</p>
            </div>

            <div style={card}>
                <h2 style={h2}>{text.policyHeading}</h2>
                <p style={body}>{text.policy}</p>
                <h2 style={{ ...h2, marginTop: '14px' }}>{text.studentsHeading}</h2>
                <p style={body}>{text.students}</p>
            </div>

            <div style={card}>
                <h2 style={h2}>{text.authorizationHeading}</h2>

                {form.signedRows.filter(r => !replacing.has(r.id)).length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>{ui.alreadySigned}</div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {form.signedRows.filter(r => !replacing.has(r.id)).map(r => (
                                <li key={r.id} style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>{formatReleaseDate(r.dateFrom)} – {formatReleaseDate(r.dateTo)}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{r.reasonCode}. {text.reasons[r.reasonCode]} · {describeTimes(r.times)}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ui.signedOn(formatSignedAt(r.signedAt))}</span>
                                        <button type="button" onClick={() => setDrafts(prev => [...prev.filter(d => d.supersedes || d.dateFrom || d.dateTo || d.reasonCode !== '' || d.time), newRowDraft(r)])} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{ui.change}</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {!adding && (
                    <fieldset style={{ margin: '0 0 14px', padding: 0, border: 'none' }}>
                        <legend style={{ padding: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>{ui.yourDates}</legend>
                        {([[false, ui.fullProgram], [true, ui.needsEarly]] as const).map(([value, label]) => (
                            <label key={String(value)} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', marginBottom: '8px', borderRadius: '12px', border: needsEarly === value ? '1.5px solid var(--color-primary)' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-input)', cursor: 'pointer' }}>
                                <input type="radio" name="needs-early" checked={needsEarly === value} onChange={() => { setNeedsEarly(value); if (value && drafts.length === 0) setDrafts([newRowDraft()]); }} style={{ width: '20px', height: '20px', marginTop: '1px', flexShrink: 0 }} />
                                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>{label}</span>
                            </label>
                        ))}
                        {needsEarly === false && <p style={{ ...body, fontSize: '13px', color: 'var(--text-secondary)' }}>{ui.fullProgramHelp}</p>}
                    </fieldset>
                )}

                {showRows && (
                    <ReleaseRowsEditor drafts={drafts} onChange={setDrafts} text={text} showProblems={tried} startAt={form.signedRows.filter(r => !replacing.has(r.id)).length + 1} />
                )}
            </div>

            {!adding && (
                <div style={card}>
                    <h2 style={h2}>{text.agreementHeading}</h2>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>{text.agreementSubheading}</div>
                    <p style={body}>{text.agreement}</p>
                </div>
            )}

            <div style={card}>
                <h2 style={h2}>{ui.signHeading}</h2>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>{ui.yourName}</span>
                    <input type="text" autoComplete="name" value={name} maxLength={120} onChange={e => setName(e.target.value)} style={fieldStyle} />
                </label>
                <div role="group" aria-label={ui.signHeading} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    {(['typed', 'drawn'] as const).map(k => (
                        <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: kind === k ? '1.5px solid var(--text-main)' : '1px solid var(--border-subtle)', backgroundColor: kind === k ? 'var(--text-main)' : 'var(--bg-card)', color: kind === k ? 'var(--bg-card)' : 'var(--text-main)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>{k === 'typed' ? ui.typeTab : ui.drawTab}</button>
                    ))}
                </div>
                {kind === 'typed' ? (
                    <div style={{ padding: '14px', minHeight: '70px', borderRadius: '12px', border: '1.5px dashed var(--border-subtle)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>{ui.typedPreview}</div>
                        <TypedSignaturePreview name={name.trim()} />
                    </div>
                ) : (
                    <SignaturePad onChange={setDrawn} hint={ui.drawHere} clearLabel={ui.clear} />
                )}

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '14px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} style={{ width: '22px', height: '22px', marginTop: '1px', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-main)' }}>{text.consent}</span>
                </label>

                <div ref={problemRef}>
                    {tried && problem && <div role="alert" style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--color-danger-bg)', color: '#b91c1c', fontSize: '14px', fontWeight: 700 }}>{problem}</div>}
                    {failed && <div role="alert" style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--color-danger-bg)', color: '#b91c1c', fontSize: '14px', fontWeight: 700 }}>{ui.errors.failed}</div>}
                </div>

                <button type="button" onClick={send} disabled={sending} style={{ width: '100%', marginTop: '14px', padding: '16px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--color-success)', color: '#fff', fontSize: '16px', fontWeight: 800, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1 }}>
                    {sending ? ui.submitting : ui.submit}
                </button>
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>{form.formVersion}</p>
            </div>
        </>,
    );
};

/** The parent's page for a link's token, reading the form from this device or the database. */
export const GuardianReleaseFormForLink = ({ token, source, onSigned }: { token: string; source: LinkSource; onSigned?: () => void }) => (
    <GuardianReleaseForm load={() => openGuardianForm(token, source)} submit={input => submitGuardianForm(token, source, input)} onSigned={onSigned} />
);

/**
 * The whole page a guardian lands on from their link (see main.tsx). The app's
 * body does not scroll, so this brings its own scrolling area.
 */
export const GuardianLinkPage = ({ token }: { token: string }) => (
    <main style={{ position: 'fixed', inset: 0, overflowY: 'auto', backgroundColor: 'var(--bg-app)', paddingTop: 'env(safe-area-inset-top)', WebkitOverflowScrolling: 'touch' }}>
        {/* Without a database there is nowhere a link could point: such forms only open on the staff device. */}
        <GuardianReleaseFormForLink token={token} source={isSupabaseConfigured ? 'database' : 'device'} />
    </main>
);

export { releaseTokenFromLocation };
export default GuardianReleaseForm;
