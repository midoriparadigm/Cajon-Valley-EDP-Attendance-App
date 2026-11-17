// src/services/releaseForms.ts — Early Release Forms: where they are kept and how they change
//
// Storage follows the same rule as the event log (auditLog.ts):
//   • Students who are real database rows, once the forms tables exist
//     (supabase/migrations/20261116000000_early_release_forms.sql): forms live
//     in Supabase. Staff write through the signed-in session; the guardian,
//     who has no account, reads and signs through two database functions that
//     accept only the single-use token from their link. Every timestamp is the
//     database's clock.
//   • Everyone else (the sample roster, students added this session, no
//     database, or tables not set up yet): forms stay in this device's memory
//     and are gone on logout or reload. The parent's page can then only be
//     opened from this device ("Open the parent's view").
//
// Nothing is ever edited. Each action adds rows — a link, date ranges with
// their signatures, a countersignature, a Cityspan entry — and the form's
// status is worked out from what exists (utils/releaseForms.ts).

import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured, runDbWrite } from '../supabaseClient';
import { uuidv4 } from '../utils/helpers';
import { sendSmsMock, sendEmailMock } from '../utils/sms';
import { RELEASE_FORM_VERSION, RELEASE_LINK_DAYS, RELEASE_WEEKDAYS } from '../utils/releaseFormText';
import { activeRows, agreementSignature, isSignaturePath, latestLink, rowInputProblem, rowSignature, type ReleaseRowInput } from '../utils/releaseForms';
import { isDbStudent } from './dbStudents';
import type { ReleaseEntry, ReleaseForm, ReleaseLanguage, ReleaseLink, ReleaseRow, ReleaseSignature, Student } from '../types';

/**
 * Whether the database can hold forms:
 *   off      no database configured
 *   unknown  not asked yet
 *   ready    tables found
 *   missing  the migration has not been applied
 *   error    the last read failed for another reason
 */
export type ReleaseStorage = 'off' | 'unknown' | 'ready' | 'missing' | 'error';

// ── In-memory store ──────────────────────────────────────────────────────────

let forms: readonly ReleaseForm[] = [];
let storage: ReleaseStorage = isSupabaseConfigured ? 'unknown' : 'off';
const listeners = new Set<() => void>();

const publish = (next: readonly ReleaseForm[], nextStorage: ReleaseStorage = storage) => {
    forms = next;
    storage = nextStorage;
    listeners.forEach(l => l());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** Live list of every form this device knows about. */
export const useReleaseForms = (): readonly ReleaseForm[] => useSyncExternalStore(subscribe, () => forms);
export const useReleaseStorage = (): ReleaseStorage => useSyncExternalStore(subscribe, () => storage);
export const getReleaseForms = (): readonly ReleaseForm[] => forms;

/** Forgets every form held on this device — on logout. */
export const clearReleaseForms = () => publish([], isSupabaseConfigured ? 'unknown' : 'off');

const replaceForm_ = (next: ReleaseForm) => publish(forms.map(f => (f.id === next.id ? next : f)));

/** Forms for this student go to the database (true) or stay on this device (false). */
const usesDatabase = (studentId: string) => storage === 'ready' && isDbStudent(studentId);

// ── Reading from the database ────────────────────────────────────────────────

interface FormRow { id: string; student_id: string; student_name: string; grade: string; site_name: string; cycle: string; program_hours: string; form_version: string; supersedes: string | null; created_by_name: string; created_at: string }
interface RowRow { id: string; form_id: string; date_from: string; date_to: string; reason_code: number; mon: string | null; tue: string | null; wed: string | null; thu: string | null; fri: string | null; supersedes: string | null; created_at: string }
interface SignatureRow { id: string; form_id: string; row_id: string | null; role: ReleaseSignature['role']; signer_name: string; signature_kind: ReleaseSignature['kind']; signature: string; consented: boolean; channel: ReleaseSignature['channel']; sent_to: string | null; language: ReleaseLanguage | null; link_id: string | null; paper_signed_on: string | null; signed_at: string }
interface LinkRow { id: string; form_id: string; channel: ReleaseLink['channel']; sent_to: string; sent_by_name: string; sent_at: string; expires_at: string }
interface EntryRow { id: string; row_id: string; entered_by_name: string; entered_at: string }

/** Postgres returns a time as "13:15:00"; the app keeps "13:15". */
const hhmm = (t: string | null | undefined): string | undefined => (t ? t.slice(0, 5) : undefined);

const timesFrom = (r: Pick<RowRow, 'mon' | 'tue' | 'wed' | 'thu' | 'fri'>): ReleaseRow['times'] => {
    const times: ReleaseRow['times'] = {};
    RELEASE_WEEKDAYS.forEach(d => { const t = hhmm(r[d]); if (t) times[d] = t; });
    return times;
};

const PAGE_SIZE = 1000; // Supabase's default per-request row cap

type TableRead<T> = { rows: T[] } | { error: { code?: string; message: string } };

/** Every row of one table, paged until complete. The token hash on links is never selected. */
const readAll = async <T>(table: string, columns: string, orderBy: string): Promise<TableRead<T>> => {
    const rows: T[] = [];
    try {
        for (let page = 0; ; page++) {
            const { data, error } = await supabase.from(table).select(columns)
                .order(orderBy, { ascending: true }).order('id', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            if (error) return { error };
            rows.push(...(data as T[]));
            if ((data as T[]).length < PAGE_SIZE) return { rows };
        }
    } catch (err) {
        return { error: { message: err instanceof Error ? err.message : String(err) } };
    }
};

/** PostgREST's ways of saying the table isn't there: the migration has not been applied. */
const isMissingTable = (e: { code?: string; message: string }) =>
    e.code === '42P01' || e.code === 'PGRST205' || /schema cache|does not exist/i.test(e.message);

let loading: Promise<void> | null = null;

/**
 * Loads every form from the database, keeping the device-only ones. Safe to
 * call often (the forms screens poll it so a parent's signature shows up);
 * overlapping calls share one request.
 */
export const loadReleaseForms = (): Promise<void> => {
    if (!isSupabaseConfigured) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
        const [f, r, s, l, e] = await Promise.all([
            readAll<FormRow>('release_forms', '*', 'created_at'),
            readAll<RowRow>('release_rows', '*', 'created_at'),
            readAll<SignatureRow>('release_signatures', '*', 'signed_at'),
            readAll<LinkRow>('release_links', 'id,form_id,channel,sent_to,sent_by_name,sent_at,expires_at', 'sent_at'),
            readAll<EntryRow>('release_entries', '*', 'entered_at'),
        ]);
        const failed = [f, r, s, l, e].find((x): x is { error: { code?: string; message: string } } => 'error' in x);
        if (failed || !('rows' in f) || !('rows' in r) || !('rows' in s) || !('rows' in l) || !('rows' in e)) {
            const missing = !!failed && isMissingTable(failed.error);
            if (failed && !missing) console.warn('[Release forms] read failed:', failed.error.message);
            publish(forms, missing ? 'missing' : 'error');
            return;
        }
        const rowFormId = new Map(r.rows.map(row => [row.id, row.form_id]));
        const remote: ReleaseForm[] = f.rows.map(form => ({
            id: form.id,
            studentId: form.student_id,
            studentName: form.student_name,
            grade: form.grade,
            siteName: form.site_name,
            cycle: form.cycle,
            programHours: form.program_hours,
            formVersion: form.form_version,
            supersedes: form.supersedes ?? undefined,
            createdBy: form.created_by_name,
            createdAt: form.created_at,
            rows: r.rows.filter(x => x.form_id === form.id).map(x => ({
                id: x.id, formId: x.form_id, dateFrom: x.date_from, dateTo: x.date_to, reasonCode: x.reason_code,
                times: timesFrom(x), supersedes: x.supersedes ?? undefined, createdAt: x.created_at,
            })),
            signatures: s.rows.filter(x => x.form_id === form.id).map(x => ({
                id: x.id, formId: x.form_id, rowId: x.row_id ?? undefined, role: x.role, signerName: x.signer_name,
                kind: x.signature_kind, signature: x.signature, consented: x.consented, channel: x.channel,
                sentTo: x.sent_to ?? undefined, language: x.language ?? undefined, linkId: x.link_id ?? undefined,
                paperSignedOn: x.paper_signed_on ?? undefined, signedAt: x.signed_at,
            })),
            links: l.rows.filter(x => x.form_id === form.id).map(x => ({
                id: x.id, formId: x.form_id, channel: x.channel, sentTo: x.sent_to, sentBy: x.sent_by_name, sentAt: x.sent_at, expiresAt: x.expires_at,
            })),
            entries: e.rows.filter(x => rowFormId.get(x.row_id) === form.id).map(x => ({
                id: x.id, rowId: x.row_id, enteredBy: x.entered_by_name, enteredAt: x.entered_at,
            })),
            localOnly: false,
        }));
        publish([...forms.filter(x => x.localOnly), ...remote], 'ready');
    })().finally(() => { loading = null; });
    return loading;
};

// ── Starting forms ───────────────────────────────────────────────────────────

/** Printed on every form a site starts. */
export interface ReleaseSetup {
    siteName: string;
    cycle: string;
    programHours: string;
}

const fullName = (s: Student) => `${s.firstName} ${s.lastName}`;

/** Starts one blank form per student. `failed` counts forms the database refused. */
export const startReleaseForms = async (
    students: Student[], setup: ReleaseSetup, staffName: string, supersedes?: Map<string, string>,
): Promise<{ created: ReleaseForm[]; failed: number }> => {
    const now = new Date().toISOString();
    const drafts: ReleaseForm[] = students.map(s => ({
        id: uuidv4(),
        studentId: s.id,
        studentName: fullName(s),
        grade: s.grade,
        siteName: setup.siteName,
        cycle: setup.cycle,
        programHours: setup.programHours,
        formVersion: RELEASE_FORM_VERSION,
        supersedes: supersedes?.get(s.id),
        createdBy: staffName,
        createdAt: now,
        rows: [], signatures: [], links: [], entries: [],
        localOnly: !usesDatabase(s.id),
    }));
    const remote = drafts.filter(f => !f.localOnly);
    let failed = 0;
    if (remote.length > 0) {
        const saved = await runDbWrite('Release forms', () => supabase.from('release_forms').insert(remote.map(f => ({
            id: f.id, student_id: f.studentId, student_name: f.studentName, grade: f.grade, site_name: f.siteName,
            cycle: f.cycle, program_hours: f.programHours, form_version: f.formVersion, supersedes: f.supersedes ?? null,
            created_by_name: f.createdBy,
        }))));
        if (!saved) failed = remote.length;
    }
    const created = failed > 0 ? drafts.filter(f => f.localOnly) : drafts;
    publish([...forms, ...created]);
    return { created, failed };
};

/** A corrected form: a new blank one that supersedes this one. The old one is kept. */
export const replaceReleaseForm = async (form: ReleaseForm, student: Student, staffName: string): Promise<ReleaseForm | null> => {
    const { created } = await startReleaseForms(
        [student], { siteName: form.siteName, cycle: form.cycle, programHours: form.programHours }, staffName, new Map([[student.id, form.id]]),
    );
    return created[0] ?? null;
};

// ── Sending the link ─────────────────────────────────────────────────────────

/** The address a guardian opens. The token rides in the fragment, which browsers never send to a server. */
export const releaseLinkUrl = (token: string): string => `${window.location.origin}/#release=${token}`;

/** The token in this page's address, if it was opened from a guardian's link. */
export const releaseTokenFromLocation = (): string | null => {
    const match = /^#release=([A-Za-z0-9_-]{16,128})$/.exec(window.location.hash);
    return match ? match[1] : null;
};

export interface SentLink { link: ReleaseLink; token: string; url: string }

/**
 * Creates a single-use link and sends it (texts and emails are simulated in
 * this build, so the caller shows the link for the demo). Any earlier link for
 * the form stops working. Null if the database refused.
 */
export const sendReleaseLink = async (
    form: ReleaseForm, channel: ReleaseLink['channel'], sentTo: string, staffName: string,
): Promise<SentLink | null> => {
    let token: string;
    let link: ReleaseLink;
    const now = new Date();
    if (form.localOnly) {
        token = `${uuidv4()}${uuidv4()}`.replace(/-/g, '');
        link = {
            id: uuidv4(), formId: form.id, channel, sentTo, sentBy: staffName, sentAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + RELEASE_LINK_DAYS * 86_400_000).toISOString(), token,
        };
        replaceForm_({ ...form, links: [...form.links, link] });
    } else {
        const { data, error } = await supabase.rpc('release_create_link', {
            p_form_id: form.id, p_channel: channel, p_sent_to: sentTo, p_sent_by_name: staffName,
        });
        if (error || data?.status !== 'ok') {
            console.warn('[Release forms] link not created:', error?.message ?? data?.status);
            return null;
        }
        token = data.token;
        link = { id: data.link_id, formId: form.id, channel, sentTo, sentBy: staffName, sentAt: data.sent_at, expiresAt: data.expires_at };
        await loadReleaseForms();
    }
    const url = releaseLinkUrl(token);
    const expires = new Date(link.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const firstName = form.studentName.split(' ')[0];
    if (channel === 'sms') sendSmsMock(sentTo, 'release_form_link', { student_name: firstName, cycle: form.cycle, url, expires });
    else sendEmailMock(sentTo, `Early Release Form for ${firstName}`, `Please review and sign ${firstName}'s Early Release Form for ${form.cycle}: ${url}\nThis link works once and expires ${expires}.`);
    return { link, token, url };
};

// ── The guardian's side ──────────────────────────────────────────────────────

export interface GuardianSignedRow { id: string; dateFrom: string; dateTo: string; reasonCode: number; times: ReleaseRow['times']; signedAt: string }

/** What the guardian's page shows. */
export interface GuardianFormData {
    studentName: string;
    grade: string;
    siteName: string;
    cycle: string;
    programHours: string;
    formVersion: string;
    expiresAt: string;
    /** Date ranges already signed on this form: shown as they are, each can be replaced. */
    signedRows: GuardianSignedRow[];
    /** False the first time, when the signer also signs the agreement. */
    agreementSigned: boolean;
}

export type LinkProblem = 'not_found' | 'used' | 'expired' | 'replaced' | 'error';
export type GuardianLoad = { status: 'ok'; form: GuardianFormData } | { status: LinkProblem };

export interface GuardianSubmit {
    rows: ReleaseRowInput[];
    signerName: string;
    kind: 'typed' | 'drawn';
    signature: string;
    consented: boolean;
    language: ReleaseLanguage;
}

export type GuardianResult = { status: 'signed'; signedAt: string } | { status: LinkProblem | 'invalid' };

/** Where a link's form is kept: this device's memory, or the database. */
export type LinkSource = 'device' | 'database';

const findByToken = (token: string): { form: ReleaseForm; link: ReleaseLink } | undefined => {
    for (const form of forms) {
        const link = form.links.find(l => l.token === token);
        if (link) return { form, link };
    }
    return undefined;
};

/** The same checks the database functions make, for device-only forms. */
const deviceLinkProblem = (form: ReleaseForm, link: ReleaseLink): LinkProblem | null => {
    if (form.signatures.some(s => s.linkId === link.id)) return 'used';
    if (latestLink(form)?.id !== link.id || forms.some(f => f.supersedes === form.id)) return 'replaced';
    if (Date.parse(link.expiresAt) <= Date.now()) return 'expired';
    return null;
};

const guardianData = (form: ReleaseForm, link: ReleaseLink): GuardianFormData => ({
    studentName: form.studentName, grade: form.grade, siteName: form.siteName, cycle: form.cycle,
    programHours: form.programHours, formVersion: form.formVersion, expiresAt: link.expiresAt,
    signedRows: activeRows(form).map(r => ({
        id: r.id, dateFrom: r.dateFrom, dateTo: r.dateTo, reasonCode: r.reasonCode, times: r.times,
        signedAt: rowSignature(form, r.id, 'guardian')?.signedAt ?? r.createdAt,
    })),
    agreementSigned: !!agreementSignature(form, 'guardian'),
});

const LINK_PROBLEMS: LinkProblem[] = ['not_found', 'used', 'expired', 'replaced'];
const asProblem = (status: unknown): LinkProblem => (LINK_PROBLEMS.includes(status as LinkProblem) ? (status as LinkProblem) : 'error');

export const openGuardianForm = async (token: string, source: LinkSource): Promise<GuardianLoad> => {
    if (source === 'device') {
        const found = findByToken(token);
        if (!found) return { status: 'not_found' };
        const problem = deviceLinkProblem(found.form, found.link);
        return problem ? { status: problem } : { status: 'ok', form: guardianData(found.form, found.link) };
    }
    try {
        const { data, error } = await supabase.rpc('release_form_for_link', { p_token: token });
        if (error || !data) return { status: 'error' };
        if (data.status !== 'ok') return { status: asProblem(data.status) };
        const f = data.form;
        return {
            status: 'ok',
            form: {
                studentName: f.student_name, grade: f.grade, siteName: f.site_name, cycle: f.cycle,
                programHours: f.program_hours, formVersion: f.form_version, expiresAt: f.expires_at,
                signedRows: (f.rows as (RowRow & { signed_at: string })[]).map(r => ({
                    id: r.id, dateFrom: r.date_from, dateTo: r.date_to, reasonCode: r.reason_code, times: timesFrom(r), signedAt: r.signed_at,
                })),
                agreementSigned: !!f.agreement_signed,
            },
        };
    } catch {
        return { status: 'error' };
    }
};

/** True if what the guardian sent can be signed as it is (the database repeats these checks). */
const submitIsValid = (input: GuardianSubmit, agreementSigned: boolean): boolean =>
    input.consented
    && input.signerName.trim().length > 0 && input.signerName.length <= 120
    && (input.kind === 'drawn' ? isSignaturePath(input.signature) : input.signature.trim().length > 0 && input.signature.length <= 120)
    && input.rows.length <= 20
    && (input.rows.length > 0 || !agreementSigned)
    && input.rows.every(r => rowInputProblem(r) === null);

const rowPayload = (r: ReleaseRowInput) => ({
    date_from: r.dateFrom, date_to: r.dateTo, reason_code: r.reasonCode,
    mon: r.times.mon ?? null, tue: r.times.tue ?? null, wed: r.times.wed ?? null, thu: r.times.thu ?? null, fri: r.times.fri ?? null,
    supersedes: r.supersedes ?? null,
});

/** Adds date ranges, each with its signature, to a form. Shared by the guardian's link and paper forms. */
const withSignedRows = (
    form: ReleaseForm, rows: ReleaseRowInput[], signature: Omit<ReleaseSignature, 'id' | 'formId' | 'rowId' | 'signedAt'>, now: string,
): ReleaseForm => {
    const newRows: ReleaseRow[] = rows.map(r => ({
        id: uuidv4(), formId: form.id, dateFrom: r.dateFrom, dateTo: r.dateTo, reasonCode: r.reasonCode,
        times: { ...r.times }, supersedes: r.supersedes, createdAt: now,
    }));
    const sign = (rowId?: string): ReleaseSignature => ({ ...signature, id: uuidv4(), formId: form.id, rowId, signedAt: now });
    return {
        ...form,
        rows: [...form.rows, ...newRows],
        signatures: [
            ...form.signatures,
            ...newRows.map(r => sign(r.id)),
            // The agreement is signed once, the first time.
            ...(agreementSignature(form, 'guardian') ? [] : [sign()]),
        ],
    };
};

export const submitGuardianForm = async (token: string, source: LinkSource, input: GuardianSubmit): Promise<GuardianResult> => {
    if (source === 'device') {
        const found = findByToken(token);
        if (!found) return { status: 'not_found' };
        const problem = deviceLinkProblem(found.form, found.link);
        if (problem) return { status: problem };
        if (!submitIsValid(input, !!agreementSignature(found.form, 'guardian'))) return { status: 'invalid' };
        const now = new Date().toISOString();
        replaceForm_(withSignedRows(found.form, input.rows, {
            role: 'guardian', signerName: input.signerName.trim(), kind: input.kind, signature: input.signature, consented: true,
            channel: found.link.channel, sentTo: found.link.sentTo, language: input.language, linkId: found.link.id,
        }, now));
        return { status: 'signed', signedAt: now };
    }
    try {
        const { data, error } = await supabase.rpc('release_sign_as_guardian', {
            p_token: token, p_rows: input.rows.map(rowPayload), p_signer_name: input.signerName.trim(),
            p_signature_kind: input.kind, p_signature: input.signature, p_consented: input.consented, p_language: input.language,
        });
        if (error || !data) return { status: 'error' };
        if (data.status === 'signed') return { status: 'signed', signedAt: data.signed_at };
        return { status: data.status === 'invalid' ? 'invalid' : asProblem(data.status) };
    } catch {
        return { status: 'error' };
    }
};

// ── The staff side ───────────────────────────────────────────────────────────

/**
 * Countersigns: initials on every date range not yet initialled, and the staff
 * signature on the agreement. Returns false if the database refused.
 */
export const countersignReleaseForm = async (form: ReleaseForm, staffName: string, initials: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const base = { formId: form.id, role: 'staff' as const, signerName: staffName, consented: true, channel: 'in_app' as const, signedAt: now };
    const added: ReleaseSignature[] = [
        ...activeRows(form).filter(r => !rowSignature(form, r.id, 'staff'))
            .map(r => ({ ...base, id: uuidv4(), rowId: r.id, kind: 'initials' as const, signature: initials })),
        ...(agreementSignature(form, 'staff') ? [] : [{ ...base, id: uuidv4(), kind: 'typed' as const, signature: staffName }]),
    ];
    if (added.length === 0) return true;
    if (form.localOnly) {
        replaceForm_({ ...form, signatures: [...form.signatures, ...added] });
        return true;
    }
    const saved = await runDbWrite('Release forms', () => supabase.from('release_signatures').insert(added.map(s => ({
        id: s.id, form_id: s.formId, row_id: s.rowId ?? null, role: s.role, signer_name: s.signerName,
        signature_kind: s.kind, signature: s.signature, consented: s.consented, channel: s.channel,
    }))));
    if (saved) await loadReleaseForms();
    return saved;
};

export interface PaperFormInput {
    rows: ReleaseRowInput[];
    /** The parent's or guardian's name as signed on the paper. */
    signerName: string;
    /** The date written next to the signature (YYYY-MM-DD). */
    signedOn: string;
}

/** Records a form the family signed on paper, so the site's list is complete. Staff still countersign. */
export const logPaperReleaseForm = async (form: ReleaseForm, input: PaperFormInput): Promise<boolean> => {
    if (!input.signerName.trim() || input.rows.some(r => rowInputProblem(r) !== null)) return false;
    if (form.localOnly) {
        replaceForm_(withSignedRows(form, input.rows, {
            role: 'guardian', signerName: input.signerName.trim(), kind: 'paper', signature: input.signerName.trim(),
            consented: false, channel: 'paper', paperSignedOn: input.signedOn,
        }, new Date().toISOString()));
        return true;
    }
    try {
        const { data, error } = await supabase.rpc('release_log_paper_form', {
            p_form_id: form.id, p_rows: input.rows.map(rowPayload), p_signer_name: input.signerName.trim(), p_signed_on: input.signedOn,
        });
        if (error || data?.status !== 'saved') {
            console.warn('[Release forms] paper form not saved:', error?.message ?? data?.status);
            return false;
        }
        await loadReleaseForms();
        return true;
    } catch {
        return false;
    }
};

/** The form's "For Site Use Only" box: records who entered these date ranges into Cityspan, and when. */
export const markReleaseRowsEntered = async (form: ReleaseForm, rowIds: string[], staffName: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const added: ReleaseEntry[] = rowIds
        .filter(id => !form.entries.some(e => e.rowId === id))
        .map(id => ({ id: uuidv4(), rowId: id, enteredBy: staffName, enteredAt: now }));
    if (added.length === 0) return true;
    if (form.localOnly) {
        replaceForm_({ ...form, entries: [...form.entries, ...added] });
        return true;
    }
    const saved = await runDbWrite('Release forms', () => supabase.from('release_entries').insert(
        added.map(e => ({ id: e.id, row_id: e.rowId, entered_by_name: e.enteredBy })),
    ));
    if (saved) await loadReleaseForms();
    return saved;
};
