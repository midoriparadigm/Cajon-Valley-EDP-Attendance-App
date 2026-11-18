// src/utils/releaseForms.ts — Reading Early Release Forms: status, today's release, the Cityspan list
//
// Forms are insert-only (see types.ts), so everything here is derived from
// what has been added: a form is "signed" because both signatures exist, a
// link is "used" because a signature came through it, and a date range is
// "entered in Cityspan" because an entry row says so.

import type { ReleaseForm, ReleaseLink, ReleaseRow, ReleaseSignature, ReleaseWeekday } from '../types';
import { RELEASE_REASONS, RELEASE_WEEKDAYS } from './releaseFormText';
import { localDateIso } from './helpers';

const latest = <T>(items: T[], at: (item: T) => string): T | undefined =>
    items.reduce<T | undefined>((best, item) => (!best || at(item) >= at(best) ? item : best), undefined);

/** Date ranges still in force (not replaced by a later one), earliest first. */
export const activeRows = (form: ReleaseForm): ReleaseRow[] => {
    const replaced = new Set(form.rows.map(r => r.supersedes).filter(Boolean));
    return form.rows
        .filter(r => !replaced.has(r.id))
        .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom) || a.createdAt.localeCompare(b.createdAt));
};

export const rowSignature = (form: ReleaseForm, rowId: string, role: ReleaseSignature['role']): ReleaseSignature | undefined =>
    latest(form.signatures.filter(s => s.rowId === rowId && s.role === role), s => s.signedAt);

/** The signature on the agreement at the foot of the form. */
export const agreementSignature = (form: ReleaseForm, role: ReleaseSignature['role']): ReleaseSignature | undefined =>
    latest(form.signatures.filter(s => !s.rowId && s.role === role), s => s.signedAt);

export const rowEntry = (form: ReleaseForm, rowId: string) => form.entries.find(e => e.rowId === rowId);

export const latestLink = (form: ReleaseForm): ReleaseLink | undefined => latest(form.links, l => l.sentAt);

/** The newest link, while it can still be used: not signed through and not expired. */
export const openLink = (form: ReleaseForm, now: Date = new Date()): ReleaseLink | undefined => {
    const link = latestLink(form);
    if (!link || form.signatures.some(s => s.linkId === link.id)) return undefined;
    return Date.parse(link.expiresAt) > now.getTime() ? link : undefined;
};

export type ReleaseStatus =
    /** Started; nothing sent to the family yet. */
    | 'not_sent'
    /** A link is out and has not been signed. */
    | 'waiting'
    /** The link ran out before the family signed. */
    | 'expired'
    /** The family has signed; staff have not countersigned everything. */
    | 'to_countersign'
    /** Signed by both and locked. */
    | 'signed';

export const formStatus = (form: ReleaseForm, now: Date = new Date()): ReleaseStatus => {
    if (agreementSignature(form, 'guardian')) {
        const countersigned = !!agreementSignature(form, 'staff') && activeRows(form).every(r => rowSignature(form, r.id, 'staff'));
        return countersigned ? 'signed' : 'to_countersign';
    }
    const link = latestLink(form);
    if (!link) return 'not_sent';
    return Date.parse(link.expiresAt) > now.getTime() ? 'waiting' : 'expired';
};

/** Countersigned date ranges nobody has entered into Cityspan yet. */
export const rowsToEnter = (form: ReleaseForm): ReleaseRow[] =>
    activeRows(form).filter(r => rowSignature(form, r.id, 'staff') && !rowEntry(form, r.id));

/** Forms that have not been replaced by a corrected one. */
export const currentForms = (forms: readonly ReleaseForm[]): ReleaseForm[] => {
    const replaced = new Set(forms.map(f => f.supersedes).filter(Boolean));
    return forms.filter(f => !replaced.has(f.id));
};

/** A student's current form for one cycle (the newest, if several were started). */
export const formFor = (forms: readonly ReleaseForm[], studentId: string, cycle: string): ReleaseForm | undefined =>
    latest(currentForms(forms).filter(f => f.studentId === studentId && f.cycle === cycle), f => f.createdAt);

// ── Display ──────────────────────────────────────────────────────────────────

/** "13:15" → "1:15 PM" */
export const formatReleaseTime = (hhmm: string): string => {
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "2026-11-06" → "11/06/2026", the way the paper form writes dates. */
export const formatReleaseDate = (iso: string): string => {
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${m}/${d}/${y}` : iso;
};

export const formatSignedAt = (iso: string): string =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const reasonLabel = (code: number): string => `${code}. ${RELEASE_REASONS[code] ?? 'Unknown reason'}`;

/** "VT" from "Veronica Thomas (EDP)". */
export const initialsOf = (name: string): string =>
    name.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).filter(Boolean).map(p => p[0]!.toUpperCase()).join('');

/** The date that goes next to a signature, "11/06/2026": the date written on paper, or the day it was signed. */
export const signatureDate = (s: Pick<ReleaseSignature, 'signedAt' | 'paperSignedOn'>): string =>
    formatReleaseDate(s.paperSignedOn ?? localDateIso(new Date(s.signedAt)));

const SHORT_DAY: Record<ReleaseWeekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

/** "1:15 PM, Mon–Fri" when every day matches; otherwise each day with its time. */
export const describeTimes = (times: ReleaseRow['times']): string => {
    const days = RELEASE_WEEKDAYS.filter(d => times[d]);
    if (days.length === 0) return 'No early release';
    const first = times[days[0]]!;
    if (days.every(d => times[d] === first)) {
        return `${formatReleaseTime(first)}, ${days.length === 5 ? 'Mon–Fri' : days.map(d => SHORT_DAY[d]).join(', ')}`;
    }
    return days.map(d => `${SHORT_DAY[d]} ${formatReleaseTime(times[d]!)}`).join(' · ');
};

// ── Today ────────────────────────────────────────────────────────────────────

const WEEKDAY_BY_INDEX: (ReleaseWeekday | null)[] = [null, 'mon', 'tue', 'wed', 'thu', 'fri', null];

export interface ReleaseToday { form: ReleaseForm; row: ReleaseRow; time: string }

/**
 * The approved early release that applies to a student on one day, if any: a
 * countersigned date range covering that date with a time for that weekday.
 * When ranges overlap, the one signed most recently counts.
 */
export const releaseOn = (forms: readonly ReleaseForm[], studentId: string, date: Date = new Date()): ReleaseToday | null => {
    const weekday = WEEKDAY_BY_INDEX[date.getDay()];
    if (!weekday) return null;
    const iso = localDateIso(date);
    const matches: ReleaseToday[] = [];
    currentForms(forms).filter(f => f.studentId === studentId).forEach(form => {
        activeRows(form).forEach(row => {
            const time = row.times[weekday];
            if (time && row.dateFrom <= iso && iso <= row.dateTo && rowSignature(form, row.id, 'staff')) matches.push({ form, row, time });
        });
    });
    return latest(matches, m => m.row.createdAt) ?? null;
};

// ── Checking what somebody typed ─────────────────────────────────────────────

export interface ReleaseRowInput {
    dateFrom: string;
    dateTo: string;
    reasonCode: number;
    times: Partial<Record<ReleaseWeekday, string>>;
    supersedes?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What is wrong with a date range, or null. */
export const rowInputProblem = (r: ReleaseRowInput): 'dates' | 'order' | 'reason' | 'time' | 'days' | null => {
    if (!ISO_DATE.test(r.dateFrom) || !ISO_DATE.test(r.dateTo)) return 'dates';
    if (r.dateTo < r.dateFrom) return 'order';
    if (!RELEASE_REASONS[r.reasonCode]) return 'reason';
    const given = RELEASE_WEEKDAYS.filter(d => r.times[d] !== undefined);
    if (given.some(d => !HH_MM.test(r.times[d]!))) return 'time';
    if (given.length === 0) return 'days';
    return null;
};

/** A drawn signature is stored as SVG path data made only of move/line commands. */
export const isSignaturePath = (s: string): boolean => s.length > 0 && s.length <= 20000 && /^[ML0-9 .,-]+$/.test(s);

// ── The list to enter into Cityspan ──────────────────────────────────────────

const HOW_SIGNED: Record<ReleaseSignature['channel'], string> = { sms: 'Text link', email: 'Email link', in_app: 'In the app', paper: 'On paper' };

export const CITYSPAN_EXPORT_HEADER = [
    'Student', 'Grade', 'School', 'Program cycle', 'Date from', 'Date to', 'Reason number', 'Reason',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Parent/guardian', 'Parent signed', 'How signed', 'Link sent to', 'Staff', 'Staff signed',
    'Entered in Cityspan', 'Entered by', 'Form version',
];

/** One line per countersigned date range. `onlyToEnter` leaves out the ones already entered. */
export const cityspanExportRows = (forms: readonly ReleaseForm[], onlyToEnter: boolean): string[][] =>
    currentForms(forms)
        .slice()
        .sort((a, b) => a.studentName.localeCompare(b.studentName))
        .flatMap(form => activeRows(form)
            .filter(row => rowSignature(form, row.id, 'staff') && !(onlyToEnter && rowEntry(form, row.id)))
            .map(row => {
                const guardian = rowSignature(form, row.id, 'guardian');
                const staff = rowSignature(form, row.id, 'staff');
                const entry = rowEntry(form, row.id);
                return [
                    form.studentName, form.grade, form.siteName, form.cycle,
                    formatReleaseDate(row.dateFrom), formatReleaseDate(row.dateTo), String(row.reasonCode), RELEASE_REASONS[row.reasonCode] ?? '',
                    ...RELEASE_WEEKDAYS.map(d => (row.times[d] ? formatReleaseTime(row.times[d]!) : '')),
                    guardian?.signerName ?? '',
                    guardian ? (guardian.paperSignedOn ? formatReleaseDate(guardian.paperSignedOn) : formatSignedAt(guardian.signedAt)) : '',
                    guardian ? HOW_SIGNED[guardian.channel] : '',
                    guardian?.sentTo ?? '',
                    staff?.signerName ?? '', staff ? formatSignedAt(staff.signedAt) : '',
                    entry ? formatSignedAt(entry.enteredAt) : '', entry?.enteredBy ?? '',
                    form.formVersion,
                ];
            }));

// ── What happened to a form, in order ────────────────────────────────────────

export interface ReleaseTimelineItem { at: string; icon: string; title: string; detail?: string }

const groupBy = <T>(items: T[], key: (item: T) => string): T[][] => {
    const groups = new Map<string, T[]>();
    items.forEach(item => {
        const k = key(item);
        const list = groups.get(k);
        if (list) list.push(item); else groups.set(k, [item]);
    });
    return [...groups.values()];
};

const ranges = (n: number) => `${n} date range${n === 1 ? '' : 's'}`;
export const LANGUAGE_NAME: Record<string, string> = { en: 'English', es: 'Spanish' };
const VIA: Record<ReleaseSignature['channel'], string> = { sms: 'from the texted link', email: 'from the emailed link', in_app: 'in the app', paper: 'on paper' };

/** One person signing in one sitting: the date ranges and/or the agreement, all with the same time. */
export interface ReleaseSitting {
    /** The agreement signature if there is one, else the first date range's. */
    signature: ReleaseSignature;
    rowCount: number;
    agreement: boolean;
    /** "3 date ranges and the agreement" */
    what: string;
}

/** Every signing sitting on a form, oldest first. */
export const signingSittings = (form: ReleaseForm): ReleaseSitting[] =>
    groupBy(form.signatures, s => `${s.role}|${s.signedAt}|${s.signerName}`)
        .map(group => {
            const rowCount = group.filter(x => x.rowId).length;
            const agreement = group.some(x => !x.rowId);
            return {
                signature: group.find(x => !x.rowId) ?? group[0],
                rowCount, agreement,
                what: [rowCount > 0 && ranges(rowCount), agreement && 'the agreement'].filter(Boolean).join(' and '),
            };
        })
        .sort((a, b) => a.signature.signedAt.localeCompare(b.signature.signedAt));

/** How a guardian's sitting was signed, e.g. "from the texted link · drawn signature · shown in English". */
export const describeGuardianSitting = (s: ReleaseSignature): string =>
    [VIA[s.channel], s.kind === 'drawn' ? 'drawn signature' : s.kind === 'typed' ? 'typed signature' : undefined, s.language && `shown in ${LANGUAGE_NAME[s.language] ?? s.language}`, s.paperSignedOn && `dated ${formatReleaseDate(s.paperSignedOn)}; recorded by staff`].filter(Boolean).join(' · ');

/** Every step recorded for a form, oldest first: started, links sent, signatures, Cityspan entries. */
export const formTimeline = (form: ReleaseForm): ReleaseTimelineItem[] => {
    const items: ReleaseTimelineItem[] = [
        { at: form.createdAt, icon: 'note_add', title: `Form started by ${form.createdBy}`, detail: `${form.cycle} · ${form.formVersion}` },
        ...form.links.map(l => ({
            at: l.sentAt, icon: l.channel === 'sms' ? 'sms' : 'mail',
            title: `Link ${l.channel === 'sms' ? 'texted' : 'emailed'} to ${l.sentTo}`,
            detail: `by ${l.sentBy} · works once · expires ${new Date(l.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
        })),
        // One sitting produces several signatures with the same time: show it as one step.
        ...signingSittings(form).map(({ signature: s, what }) => (s.role === 'guardian'
            ? { at: s.signedAt, icon: 'draw', title: `Signed by ${s.signerName} (parent/guardian)`, detail: [what, describeGuardianSitting(s)].filter(Boolean).join(' · ') }
            : { at: s.signedAt, icon: 'verified', title: `Countersigned by ${s.signerName}`, detail: what })),
        ...groupBy(form.entries, e => `${e.enteredAt}|${e.enteredBy}`).map(group => ({
            at: group[0].enteredAt, icon: 'cloud_done', title: `Marked as entered into Cityspan by ${group[0].enteredBy}`, detail: ranges(group.length),
        })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
};
