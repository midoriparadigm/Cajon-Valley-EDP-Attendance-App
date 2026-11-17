// src/components/ReleaseFormsView.tsx — Leader Dashboard → Early Release Forms
//
// The site's list for one program cycle: who has no form yet, who has been sent
// a link, which forms are waiting for a staff signature, and which signed date
// ranges still have to be typed into Cityspan. Replaces the paper form's
// round trip (hand out, collect, sign, retype) with a link the family signs
// on their phone; the export is everything Cityspan needs, ready to enter.
import React, { useEffect, useMemo, useState } from 'react';
import type { ReleaseForm, Student } from '../types';
import { GRADES } from '../constants';
import { isSupabaseConfigured } from '../supabaseClient';
import { serializeCsv } from '../utils/csv';
import { localDateIso } from '../utils/helpers';
import { DEFAULT_PROGRAM_HOURS } from '../utils/releaseFormText';
import {
    CITYSPAN_EXPORT_HEADER, activeRows, agreementSignature, cityspanExportRows, formFor, formStatus, formatSignedAt, latestLink, rowsToEnter,
} from '../utils/releaseForms';
import {
    loadReleaseForms, sendReleaseLink, startReleaseForms, useReleaseForms, useReleaseStorage, type ReleaseSetup,
} from '../services/releaseForms';
import ReleaseFormDetail, { ReleaseStatusChip } from './ReleaseFormDetail';

type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ReleaseFormsViewProps {
    students: Student[];
    staffName: string;
    showToast: (msg: string, type: ToastType) => void;
}

/** Where each student stands for the chosen cycle. */
type Stage = 'none' | 'waiting' | 'to_countersign' | 'to_enter' | 'done';

const STAGES: { id: Stage; label: string; help: string }[] = [
    { id: 'none', label: 'No form yet', help: 'Not sent, or the link expired' },
    { id: 'waiting', label: 'Waiting for parent', help: 'Link sent, not signed' },
    { id: 'to_countersign', label: 'To countersign', help: 'Parent signed' },
    { id: 'to_enter', label: 'To enter in Cityspan', help: 'Signed by both' },
    { id: 'done', label: 'Complete', help: 'Signed and entered' },
];

const stageOf = (form: ReleaseForm | undefined): Stage => {
    if (!form) return 'none';
    const status = formStatus(form);
    if (status === 'waiting') return 'waiting';
    if (status === 'to_countersign') return 'to_countersign';
    if (status === 'signed') return rowsToEnter(form).length > 0 ? 'to_enter' : 'done';
    return 'none';
};

const SETUP_KEY = 'edp-release-setup';

/** The cycles a site runs in a school year (three trimesters and three camps), plus this cycle's best guess. */
const cycleOptions = (now: Date = new Date()): { options: string[]; current: string } => {
    const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; // school year starts in July
    const year = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
    const options = [
        `${year} Trimester 1`, `${year} Trimester 2`, `${year} Trimester 3`,
        `Winter Camp ${start}`, `Spring Camp ${start + 1}`, `Summer Camp ${start + 1}`,
    ];
    const m = now.getMonth();
    return { options, current: options[m >= 7 && m <= 9 ? 0 : m >= 10 || m <= 1 ? 1 : m <= 5 ? 2 : 5] };
};

const loadSetup = (): ReleaseSetup => {
    const fallback: ReleaseSetup = { siteName: isSupabaseConfigured ? '' : 'Sample Elementary School', cycle: cycleOptions().current, programHours: DEFAULT_PROGRAM_HOURS };
    try {
        const saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null');
        return saved && typeof saved === 'object' ? { ...fallback, ...saved } : fallback;
    } catch {
        return fallback;
    }
};

const rosterOrder = (a: Student, b: Student) =>
    GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName);

const input: React.CSSProperties = { padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '15px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' };

const ReleaseFormsView = ({ students, staffName, showToast }: ReleaseFormsViewProps) => {
    const forms = useReleaseForms();
    const storage = useReleaseStorage();
    const [setup, setSetup] = useState<ReleaseSetup>(loadSetup);
    const [grade, setGrade] = useState('all');
    const [stage, setStage] = useState<Stage | 'all'>('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [openStudentId, setOpenStudentId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const cycles = useMemo(() => cycleOptions(), []);

    // A parent signs on their own phone, so keep asking the database while this screen is open.
    useEffect(() => {
        if (!isSupabaseConfigured) return;
        void loadReleaseForms();
        const timer = setInterval(() => { void loadReleaseForms(); }, 10_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* storage unavailable */ }
    }, [setup]);

    const roster = useMemo(() => [...students].sort(rosterOrder), [students]);
    const byStudent = useMemo(
        () => new Map(roster.map(s => [s.id, formFor(forms, s.id, setup.cycle)])),
        [roster, forms, setup.cycle],
    );
    const inGrade = useMemo(() => (grade === 'all' ? roster : roster.filter(s => s.grade === grade)), [roster, grade]);
    const counts = useMemo(() => {
        const c: Record<Stage, number> = { none: 0, waiting: 0, to_countersign: 0, to_enter: 0, done: 0 };
        inGrade.forEach(s => { c[stageOf(byStudent.get(s.id))] += 1; });
        return c;
    }, [inGrade, byStudent]);

    const q = search.trim().toLowerCase();
    const shown = inGrade.filter(s =>
        (stage === 'all' || stageOf(byStudent.get(s.id)) === stage)
        && (!q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)));
    const sendable = shown.filter(s => stageOf(byStudent.get(s.id)) === 'none');
    const chosen = sendable.filter(s => selected.has(s.id));

    const cycleForms = useMemo(() => forms.filter(f => f.cycle === setup.cycle), [forms, setup.cycle]);
    const toEnterCount = useMemo(() => cityspanExportRows(cycleForms, true).length, [cycleForms]);
    const signedCount = useMemo(() => cityspanExportRows(cycleForms, false).length, [cycleForms]);

    const setupReady = setup.siteName.trim() !== '' && setup.cycle.trim() !== '' && setup.programHours.trim() !== '';

    /** Starts a form if the student has none for this cycle, then sends the link to Contact 1. */
    const sendTo = async (list: Student[]) => {
        if (busy) return;
        if (!setupReady) { showToast('Enter the school name, cycle and program hours first', 'warning'); return; }
        setBusy(true);
        let sent = 0, noContact = 0, failed = 0;
        try {
            const needForm = list.filter(s => !byStudent.get(s.id));
            const started = needForm.length > 0
                ? await startReleaseForms(needForm, { siteName: setup.siteName.trim(), cycle: setup.cycle.trim(), programHours: setup.programHours.trim() }, staffName)
                : { created: [], failed: 0 };
            failed += started.failed;
            const startedFor = new Map(started.created.map(f => [f.studentId, f]));
            for (const s of list) {
                const form = byStudent.get(s.id) ?? startedFor.get(s.id);
                if (!form) continue;
                const contact = s.guardians.find(g => g.type === 'Contact 1');
                const channel = contact?.phone ? 'sms' : contact?.email ? 'email' : null;
                if (!contact || !channel) { noContact += 1; continue; }
                const result = await sendReleaseLink(form, channel, (channel === 'sms' ? contact.phone : contact.email)!, staffName);
                if (result) sent += 1; else failed += 1;
            }
        } finally {
            setBusy(false);
            setSelected(new Set());
        }
        const parts = [
            sent > 0 && `${sent} link${sent === 1 ? '' : 's'} sent (simulated)`,
            noContact > 0 && `${noContact} with no phone or email for Contact 1`,
            failed > 0 && `${failed} could not be saved`,
        ].filter(Boolean).join(' · ');
        showToast(parts || 'Nothing to send', failed > 0 ? 'error' : noContact > 0 ? 'warning' : 'success');
    };

    const exportCsv = (onlyToEnter: boolean) => {
        const blob = new Blob([serializeCsv([CITYSPAN_EXPORT_HEADER, ...cityspanExportRows(cycleForms, onlyToEnter)])], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edp-early-release-${onlyToEnter ? 'to-enter' : 'all-signed'}-${localDateIso()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const lineFor = (s: Student, form: ReleaseForm | undefined): string => {
        if (!form) return 'No form for this cycle';
        const status = formStatus(form);
        const link = latestLink(form);
        const guardian = agreementSignature(form, 'guardian');
        if (status === 'not_sent') return 'Started, not sent';
        if (status === 'expired') return `Link sent ${link ? formatSignedAt(link.sentAt) : ''} expired unsigned`;
        if (status === 'waiting') return `Link sent to ${link?.sentTo ?? 'the family'} · ${link ? formatSignedAt(link.sentAt) : ''}`;
        const n = activeRows(form).length;
        const what = n === 0 ? 'full program, no early release' : `${n} date range${n === 1 ? '' : 's'}`;
        if (status === 'to_countersign') return `${guardian?.signerName ?? 'Parent'} signed ${guardian ? formatSignedAt(guardian.signedAt) : ''} · ${what}`;
        const left = rowsToEnter(form).length;
        return `${what}${n > 0 ? (left > 0 ? ` · ${left} to enter in Cityspan` : ' · entered in Cityspan') : ''}`;
    };

    // ── One student's form ──
    const openStudent = openStudentId ? roster.find(s => s.id === openStudentId) : undefined;
    if (openStudent) {
        const form = byStudent.get(openStudent.id);
        return (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <button type="button" onClick={() => setOpenStudentId(null)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>arrow_back</span>All forms
                </button>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>{openStudent.firstName} {openStudent.lastName} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>· Grade {openStudent.grade} · {setup.cycle}</span></h3>
                {form ? (
                    <ReleaseFormDetail key={form.id} form={form} student={openStudent} canAct staffName={staffName} showToast={showToast} />
                ) : (
                    <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 14px', fontSize: '14px', color: 'var(--text-secondary)' }}>No Early Release Form for {setup.cycle} yet.</p>
                        <button type="button" onClick={() => sendTo([openStudent])} disabled={busy} style={{ padding: '12px 18px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>Start the form and send the link</button>
                    </div>
                )}
            </div>
        );
    }

    // ── The site's list ──
    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
                The electronic Early Release Form. The family gets a single-use link by text or email and signs on their phone, a
                Lead countersigns, and both signatures are time stamped automatically. Signed date ranges then wait here to be
                entered into Cityspan — or exported, with no retyping from paper.
            </p>

            {storage !== 'ready' && (
                <div role="status" style={{ padding: '12px 14px', borderRadius: '12px', backgroundColor: storage === 'error' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)', color: storage === 'error' ? '#b91c1c' : '#92400e', fontSize: '14px', fontWeight: 600, lineHeight: 1.5 }}>
                    {storage === 'off' && 'Sample data: forms are kept on this device only and are gone when you log out. Open the parent\'s side from each form.'}
                    {storage === 'unknown' && 'Checking the database for forms…'}
                    {storage === 'missing' && 'The database is not set up for Early Release Forms yet (migration 20261116000000_early_release_forms.sql), so forms are kept on this device only and a parent\'s link can\'t be opened from their own phone.'}
                    {storage === 'error' && "Couldn't load forms from the database. Showing only what is on this device — this is not the full list."}
                </div>
            )}

            <section aria-label="Printed on each form" style={{ padding: '16px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <label><span style={label}>School name</span>
                    <input type="text" value={setup.siteName} placeholder="e.g. Lexington Elementary" onChange={e => setSetup({ ...setup, siteName: e.target.value })} style={{ ...input, width: '100%' }} />
                </label>
                <label><span style={label}>Program cycle</span>
                    <select value={setup.cycle} onChange={e => { setSetup({ ...setup, cycle: e.target.value }); setSelected(new Set()); }} style={{ ...input, width: '100%' }}>
                        {[...new Set([setup.cycle, ...cycles.options])].sort((a, b) => cycles.options.indexOf(a) - cycles.options.indexOf(b)).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </label>
                <label><span style={label}>Program hours (as printed on the form)</span>
                    <input type="text" value={setup.programHours} onChange={e => setSetup({ ...setup, programHours: e.target.value })} style={{ ...input, width: '100%' }} />
                </label>
            </section>

            <div role="group" aria-label="Show" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: '8px' }}>
                {STAGES.map(s => (
                    <button key={s.id} type="button" aria-pressed={stage === s.id} title={s.help} onClick={() => setStage(stage === s.id ? 'all' : s.id)} style={{ padding: '12px 14px', borderRadius: '12px', textAlign: 'left', backgroundColor: 'var(--bg-card)', border: stage === s.id ? '2px solid var(--text-main)' : '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)' }}>{counts[s.id]}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>{s.label}</div>
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input type="search" value={search} placeholder="Search student…" aria-label="Search student" onChange={e => setSearch(e.target.value)} style={{ ...input, flex: '1 1 160px', minWidth: 0 }} />
                <select title="Grade" aria-label="Grade" value={grade} onChange={e => setGrade(e.target.value)} style={input}>
                    <option value="all">All grades</option>
                    {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
                <button type="button" onClick={() => exportCsv(true)} disabled={toEnterCount === 0} title="Signed date ranges not yet entered into Cityspan" style={{ ...input, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, cursor: toEnterCount === 0 ? 'default' : 'pointer', opacity: toEnterCount === 0 ? 0.5 : 1 }}>
                    <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>download</span>To enter ({toEnterCount})
                </button>
                <button type="button" onClick={() => exportCsv(false)} disabled={signedCount === 0} title="Every signed date range for this cycle" style={{ ...input, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, cursor: signedCount === 0 ? 'default' : 'pointer', opacity: signedCount === 0 ? 0.5 : 1 }}>
                    <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '18px' }}>download</span>All signed ({signedCount})
                </button>
            </div>

            {sendable.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '12px 14px', borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                    <button type="button" onClick={() => setSelected(chosen.length === sendable.length ? new Set() : new Set(sendable.map(s => s.id)))} style={{ ...input, padding: '8px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        {chosen.length === sendable.length ? 'Clear selection' : `Select all ${sendable.length} without a form`}
                    </button>
                    <button type="button" onClick={() => sendTo(chosen)} disabled={busy || chosen.length === 0} style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: busy || chosen.length === 0 ? 'default' : 'pointer', opacity: busy || chosen.length === 0 ? 0.5 : 1 }}>
                        {busy ? 'Sending…' : `Send the form to ${chosen.length} famil${chosen.length === 1 ? 'y' : 'ies'}`}
                    </button>
                </div>
            )}

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                {shown.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>No students match</div>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {shown.map((s, i) => {
                            const form = byStudent.get(s.id);
                            const st = stageOf(form);
                            const canSelect = st === 'none';
                            return (
                                <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                                    <input type="checkbox" aria-label={`Select ${s.firstName} ${s.lastName}`} disabled={!canSelect} checked={canSelect && selected.has(s.id)} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next; })} style={{ width: '20px', height: '20px', flexShrink: 0, visibility: canSelect ? 'visible' : 'hidden' }} />
                                    <button type="button" onClick={() => setOpenStudentId(s.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{s.firstName} {s.lastName} <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '13px' }}>({s.grade})</span></span>
                                            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{lineFor(s, form)}</span>
                                        </span>
                                        {form && st !== 'none' && (
                                            <ReleaseStatusChip status={formStatus(form)} label={st === 'to_enter' ? 'To enter in Cityspan' : st === 'done' ? 'Complete' : undefined} />
                                        )}
                                        {form && st === 'none' && <ReleaseStatusChip status={formStatus(form)} />}
                                        <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '20px', color: 'var(--text-muted)' }}>chevron_right</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ReleaseFormsView;
