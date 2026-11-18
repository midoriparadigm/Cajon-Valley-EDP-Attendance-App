// src/components/ReleaseFormPrint.tsx — Printable Early Release Forms
//
// Each form prints the way the district's paper form reads (Rev. 02/05/2026),
// filled in from the electronic record: the date ranges with the parent's
// signature and the program leader's initials, the agreement with both
// signatures, and the "For Site Use Only" Cityspan line. A Signature Record
// page follows with who signed, how and when. The paper form has no room for
// that, and an electronic signature on paper means little without it.
//
// Opens as a full-screen preview with a Print button; the print dialog can
// also save a PDF. Always black on white, whatever the app's theme.
import React from 'react';
import type { ReleaseForm, ReleaseSignature, ReleaseWeekday } from '../types';
import { RELEASE_FORM_TEXT, RELEASE_WEEKDAYS, STAFF_CONSENT } from '../utils/releaseFormText';
import {
    LANGUAGE_NAME, activeRows, agreementSignature, describeTimes, formStatus, formTimeline,
    formatReleaseDate, formatReleaseTime, formatSignedAt, initialsOf, rowEntry, rowSignature, signatureDate, signingSittings,
    type ReleaseStatus,
} from '../utils/releaseForms';
import { localDateIso } from '../utils/helpers';
import { useReleaseForms } from '../services/releaseForms';
import { SignatureMark } from './ReleaseFormParts';
import PrintPreview from './PrintPreview';

const TEXT = RELEASE_FORM_TEXT.en;

const DAY_HEAD: Record<ReleaseWeekday, [string, string]> = {
    mon: ['Mon.', 'Monday'], tue: ['Tue.', 'Tuesday'], wed: ['Wed.', 'Wednesday'], thu: ['Thu.', 'Thursday'], fri: ['Fri.', 'Friday'],
};

/** The one-line warning at the top of a form page that is not an approved form. */
const NOT_FINAL_SHORT: Partial<Record<ReleaseStatus, string>> = {
    not_sent: 'Not signed: not sent to the family yet.',
    waiting: 'Not signed: the link sent to the family has not been used.',
    expired: 'Not signed: the link sent to the family expired.',
    to_countersign: 'Not approved: waiting for a staff signature.',
};

const NOT_FINAL: Partial<Record<ReleaseStatus, string>> = {
    not_sent: 'Not signed. This form has not been sent to the family yet.',
    waiting: 'Not signed. A link was sent to the family and has not been used yet.',
    expired: 'Not signed. The link sent to the family expired before it was used.',
    to_countersign: 'Not approved yet. The family signed; a staff signature is still needed.',
};

const shortDate = (iso: string) => formatReleaseDate(localDateIso(new Date(iso)));
const printedOn = () => new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const unique = (items: string[]) => [...new Set(items)];

/** A heading at a level that depends on whether the forms sit under a cover page. */
const H = ({ level, children, className }: { level: number; children: React.ReactNode; className?: string }) =>
    React.createElement(`h${Math.min(level, 6)}`, { className }, children);

/** A signature as it was made; a paper signature is said in words. */
const Mark = ({ sig, height }: { sig: ReleaseSignature; height: number }) =>
    sig.kind === 'paper' ? <i>Signed on paper</i> : <SignatureMark signature={sig} height={height} />;

/** What goes on the paper form's "For Site Use Only" line. */
const siteUse = (form: ReleaseForm): { date: string; initials: string } => {
    const rows = activeRows(form);
    const entries = rows.map(r => rowEntry(form, r.id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (rows.length === 0) return { date: 'No date ranges to enter', initials: '—' };
    if (entries.length === 0) return { date: 'Not entered yet', initials: '—' };
    const initials = unique(entries.map(e => initialsOf(e.enteredBy))).join(', ');
    if (entries.length < rows.length) return { date: `${entries.length} of ${rows.length} date ranges entered (see the record)`, initials };
    const last = entries.reduce((a, b) => (b.enteredAt > a.enteredAt ? b : a));
    return { date: shortDate(last.enteredAt), initials };
};

/** One sentence on where the form stands, for the top of the record. */
const standing = (form: ReleaseForm, replacedBy: ReleaseForm | undefined): string => {
    if (replacedBy) return `Replaced by a corrected form started ${formatSignedAt(replacedBy.createdAt)}. Kept for the record; this form is not in force.`;
    const status = formStatus(form);
    const staff = agreementSignature(form, 'staff');
    if (status === 'signed' && staff) return `Signed by both and locked. Approved by ${staff.signerName} on ${formatSignedAt(staff.signedAt)}.`;
    return NOT_FINAL[status] ?? '';
};

// ── Page 1: the form, filled in ──────────────────────────────────────────────

const Masthead = () => (
    <div className="erp-mast">
        <div><span className="erp-brand-mark">EDP</span> Extended Day Program</div>
        <div className="erp-brand-right">Cajon Valley Union School District</div>
    </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="erp-field"><b>{label}:</b><span className="erp-fill">{children}</span></div>
);

const SignLine = ({ label, sig, pending }: { label: string; sig?: ReleaseSignature; pending: string }) => (
    <div className="erp-signline">
        <b>{label}:</b>
        <span className="erp-fill erp-fill-sign">
            {sig ? <><Mark sig={sig} height={30} /><span className="erp-printed">({sig.signerName})</span></> : <i>{pending}</i>}
        </span>
        <b>Date:</b>
        <span className="erp-fill erp-fill-date">{sig ? signatureDate(sig) : '—'}</span>
    </div>
);

const FormSheet = ({ form, base, replacedBy }: { form: ReleaseForm; base: number; replacedBy?: ReleaseForm }) => {
    const rows = activeRows(form);
    const guardian = agreementSignature(form, 'guardian');
    const staff = agreementSignature(form, 'staff');
    const status = formStatus(form);
    // One line here; the Signature Record page says more.
    const notice = replacedBy
        ? 'Replaced by a corrected form and kept for the record. This form is not in force.'
        : NOT_FINAL_SHORT[status] ? `${NOT_FINAL_SHORT[status]} This printout is not an approved form.` : null;
    const use = siteUse(form);

    return (
        <section className="pp-sheet erp-form" aria-label={`Early Release Form: ${form.studentName}`}>
            <Masthead />
            <H level={base} className="erp-title">{TEXT.title}</H>
            {notice && <p className="erp-notice">{notice}</p>}

            <H level={base + 1}>{TEXT.policyHeading}</H>
            <p className="erp-legal">{TEXT.policy}</p>
            <H level={base + 1}>{TEXT.studentsHeading}</H>
            <p className="erp-legal">{TEXT.students}</p>

            <div className="erp-fields">
                <Field label="Student's Name">{form.studentName}</Field>
                <Field label="Grade Level">{form.grade}</Field>
                <Field label="School Name">{form.siteName}</Field>
                <Field label="Program Cycle">{form.cycle}</Field>
                <Field label="Program Hours">{form.programHours}</Field>
            </div>

            <H level={base + 1} className="erp-centered">{TEXT.reasonsHeading}</H>
            <ol className="erp-reasons">
                {Object.entries(TEXT.reasons).map(([code, label]) => <li key={code}>{code}. {label}</li>)}
            </ol>

            <H level={base + 1} className="erp-centered">{TEXT.authorizationHeading}</H>
            <table className="erp-table erp-auth">
                {/* Fixed widths, so no word or time is split across lines (Letter, 7.5 in. between margins). */}
                <colgroup>
                    <col style={{ width: '13.5%' }} /><col style={{ width: '9%' }} />
                    {RELEASE_WEEKDAYS.map(d => <col key={d} style={{ width: '7.6%' }} />)}
                    <col style={{ width: '17%' }} /><col style={{ width: '12.5%' }} /><col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th scope="col">Date Range</th>
                        <th scope="col">ER Reason</th>
                        {RELEASE_WEEKDAYS.map(d => <th key={d} scope="col"><abbr title={DAY_HEAD[d][1]}>{DAY_HEAD[d][0]}</abbr></th>)}
                        <th scope="col">Parent/ Guardian Signature</th>
                        <th scope="col">Date of P/G Signature</th>
                        <th scope="col">Program Leader Initials</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={10}>{guardian ? 'No early release requested: the student attends the full program hours.' : 'No date ranges yet.'}</td>
                        </tr>
                    ) : rows.map(row => {
                        const g = rowSignature(form, row.id, 'guardian');
                        const s = rowSignature(form, row.id, 'staff');
                        return (
                            <tr key={row.id}>
                                <td><span className="erp-nw">{formatReleaseDate(row.dateFrom)} –</span> <span className="erp-nw">{formatReleaseDate(row.dateTo)}</span></td>
                                <td className="erp-center">{row.reasonCode}</td>
                                {RELEASE_WEEKDAYS.map(d => <td key={d}>{row.times[d] ? formatReleaseTime(row.times[d]!) : '—'}</td>)}
                                <td>{g ? <Mark sig={g} height={26} /> : <i>Not signed</i>}</td>
                                <td>{g ? signatureDate(g) : '—'}</td>
                                <td className="erp-center">{s ? <Mark sig={s} height={26} /> : <i>Not yet</i>}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <H level={base + 1} className="erp-centered">{TEXT.agreementHeading}</H>
            <H level={base + 2} className="erp-sub">{TEXT.agreementSubheading}</H>
            <p className="erp-legal">{TEXT.agreement}</p>
            <SignLine label="Parent/Guardian's Signature" sig={guardian} pending="Not signed" />
            <SignLine label="Staff Signature" sig={staff} pending="Not signed" />

            <p className="erp-siteuse">
                For Site Use Only: Date entered into City Span web-based attendance system:{' '}
                <span className="erp-inline-fill">{use.date}</span>{' '}
                <span className="erp-nw">Staff Initials: <span className="erp-inline-fill erp-inline-short">{use.initials}</span></span>
            </p>

            <div className="erp-foot">
                <span>Electronic copy · Signature Record follows · Printed {printedOn()}</span>
                <span>{form.formVersion}</span>
            </div>
        </section>
    );
};

// ── Page 2: who signed, how and when ─────────────────────────────────────────

const Sitting = ({ form, sig, what }: { form: ReleaseForm; sig: ReleaseSignature; what: string }) => {
    if (sig.role === 'staff') {
        const initials = form.signatures.find(s => s.role === 'staff' && s.signedAt === sig.signedAt && s.kind === 'initials')?.signature;
        return (
            <div className="erp-sitting">
                <p><b>{sig.signerName}</b>, EDP staff · {formatSignedAt(sig.signedAt)}</p>
                <p>Countersigned {what} in the app{initials ? `, initials ${initials}` : ''}.</p>
                <p>Agreed before signing: “{STAFF_CONSENT}”</p>
            </div>
        );
    }
    if (sig.channel === 'paper') {
        return (
            <div className="erp-sitting">
                <p><b>{sig.signerName}</b>, parent/guardian · signed on paper, dated {formatReleaseDate(sig.paperSignedOn ?? localDateIso(new Date(sig.signedAt)))}</p>
                <p>Signed {what} on the paper form. Staff recorded it in the app on {formatSignedAt(sig.signedAt)}; keep the paper form with this copy.</p>
            </div>
        );
    }
    const link = form.links.find(l => l.id === sig.linkId);
    const sentTo = sig.sentTo ?? link?.sentTo;
    const text = RELEASE_FORM_TEXT[sig.language ?? 'en'];
    const via = sig.channel === 'sms' ? `from the link texted to ${sentTo ?? 'the family'}`
        : sig.channel === 'email' ? `from the link emailed to ${sentTo ?? 'the family'}` : 'in the app';
    const how = [
        sig.kind === 'drawn' ? 'Drawn signature' : sig.kind === 'typed' ? 'Typed signature' : null,
        sig.language ? `Form shown in ${LANGUAGE_NAME[sig.language] ?? sig.language}` : null,
    ].filter(Boolean);
    return (
        <div className="erp-sitting">
            <p><b>{sig.signerName}</b>, parent/guardian · {formatSignedAt(sig.signedAt)}</p>
            <p>
                Signed {what} {via}{link ? `, sent by ${link.sentBy} on ${formatSignedAt(link.sentAt)}` : ''}.
                {how.length > 0 && ` ${how.join('. ')}.`}
            </p>
            {sig.consented && (
                <p>Agreed before signing{sig.language && sig.language !== 'en' ? ` (shown in ${LANGUAGE_NAME[sig.language] ?? sig.language})` : ''}: “{text.consent}”</p>
            )}
        </div>
    );
};

const RecordSheet = ({ form, base, replacedBy }: { form: ReleaseForm; base: number; replacedBy?: ReleaseForm }) => {
    const rows = activeRows(form);
    const replacedRows = form.rows.filter(r => !rows.includes(r));
    const sittings = signingSittings(form);

    return (
        <section className="pp-sheet" aria-label={`Signature Record: ${form.studentName}`}>
            <H level={base + 1} className="erp-record-title">Signature Record</H>
            <p className="erp-center"><b>{form.studentName}</b> · Grade {form.grade} · {form.siteName} · {form.cycle}</p>
            <p className="erp-notice">{standing(form, replacedBy)}</p>
            <p>
                This page lists how and when each signature on this Early Release Form was made. The EDP Attendance App
                records every time automatically, from {form.localOnly ? "this device's clock" : "the database server's clock"}.
                Signed entries are never edited: a change adds a new date range or a new form, and the earlier one stays in the record.
            </p>

            <H level={base + 2}>Signatures</H>
            {sittings.length === 0
                ? <p>No signatures yet.</p>
                : sittings.map(({ signature, what }) => <Sitting key={signature.id} form={form} sig={signature} what={what} />)}

            <H level={base + 2}>History</H>
            <table className="erp-table erp-history">
                <thead><tr><th scope="col">Date and Time</th><th scope="col">What Happened</th></tr></thead>
                <tbody>
                    {formTimeline(form).map((item, i) => (
                        <tr key={i}>
                            <td className="erp-nw">{formatSignedAt(item.at)}</td>
                            <td>{item.title}{item.detail ? <><br />{item.detail[0]!.toUpperCase() + item.detail.slice(1)}</> : null}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {replacedRows.length > 0 && (
                <>
                    <H level={base + 2}>Replaced Date Ranges</H>
                    <p>The family changed these date ranges. They are no longer in force and are kept for the record.</p>
                    <table className="erp-table">
                        <thead><tr><th scope="col">Date Range</th><th scope="col">Reason</th><th scope="col">Release Times</th><th scope="col">Replaced By</th></tr></thead>
                        <tbody>
                            {replacedRows.map(row => {
                                const next = form.rows.find(r => r.supersedes === row.id);
                                return (
                                    <tr key={row.id}>
                                        <td><span className="erp-nw">{formatReleaseDate(row.dateFrom)} –</span> <span className="erp-nw">{formatReleaseDate(row.dateTo)}</span></td>
                                        <td>{row.reasonCode}</td>
                                        <td>{describeTimes(row.times)}</td>
                                        <td>{next ? `${formatReleaseDate(next.dateFrom)} – ${formatReleaseDate(next.dateTo)}, signed ${formatSignedAt(next.createdAt)}` : 'A later date range'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}

            {form.localOnly && <p className="erp-notice">Demo copy: this form was kept on this device only and was not saved to the database.</p>}
            <div className="erp-foot">
                <span>Record ID {form.id}</span>
                <span>{form.formVersion}</span>
            </div>
        </section>
    );
};

// ── Cover page for a stack of forms ──────────────────────────────────────────

const enteredSummary = (form: ReleaseForm): string => {
    const rows = activeRows(form);
    if (rows.length === 0) return 'Nothing to enter';
    const done = rows.filter(r => rowEntry(form, r.id)).length;
    return done === rows.length ? 'Yes' : done === 0 ? 'Not yet' : `${done} of ${rows.length}`;
};

const CoverSheet = ({ forms, title, subtitle }: { forms: ReleaseForm[]; title: string; subtitle: string }) => (
    <section className="pp-sheet" aria-label={title}>
        <Masthead />
        <h1 className="erp-title">{title}</h1>
        <p className="erp-center">{subtitle} · Printed {printedOn()}</p>
        <p>
            {forms.length} form{forms.length === 1 ? '' : 's'} follow{forms.length === 1 ? 's' : ''}, one per student, in grade order and then by first name.
            Each is followed by its Signature Record.
        </p>
        <table className="erp-table">
            <thead>
                <tr>
                    <th scope="col">Student</th><th scope="col">Grade</th><th scope="col">Date Ranges</th>
                    <th scope="col">Parent Signed</th><th scope="col">Staff Signed</th><th scope="col">Entered in Cityspan</th>
                </tr>
            </thead>
            <tbody>
                {forms.map(f => {
                    const g = agreementSignature(f, 'guardian');
                    const s = agreementSignature(f, 'staff');
                    const n = activeRows(f).length;
                    return (
                        <tr key={f.id}>
                            <td>{f.studentName}</td>
                            <td>{f.grade}</td>
                            <td>{n === 0 ? 'None (full program)' : n}</td>
                            <td>{g ? signatureDate(g) : 'Not signed'}</td>
                            <td>{s ? signatureDate(s) : 'Not signed'}</td>
                            <td>{enteredSummary(f)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </section>
);

// ── The preview ──────────────────────────────────────────────────────────────

interface ReleaseFormPrintProps {
    forms: ReleaseForm[];
    /** For a stack of forms: a cover page listing them. */
    cover?: { title: string; subtitle: string };
    onClose: () => void;
}

const ReleaseFormPrint = ({ forms, cover, onClose }: ReleaseFormPrintProps) => {
    const all = useReleaseForms();
    const documentTitle = cover
        ? `${cover.title} - ${cover.subtitle}`
        : forms[0] ? `Early Release Form - ${forms[0].studentName} - ${forms[0].cycle}` : 'Early Release Form';
    const base = cover ? 2 : 1;

    return (
        <PrintPreview
            documentTitle={documentTitle}
            label={`Print preview · ${forms.length} form${forms.length === 1 ? '' : 's'}`}
            margin="0.4in 0.5in"
            css={FORM_CSS}
            onClose={onClose}
        >
            {cover && <CoverSheet forms={forms} title={cover.title} subtitle={cover.subtitle} />}
            {forms.map(form => {
                const replacedBy = all.find(f => f.supersedes === form.id);
                return (
                    <React.Fragment key={form.id}>
                        <FormSheet form={form} base={base} replacedBy={replacedBy} />
                        <RecordSheet form={form} base={base} replacedBy={replacedBy} />
                    </React.Fragment>
                );
            })}
        </PrintPreview>
    );
};

export default ReleaseFormPrint;

// One form page and one record page per student (PrintPreview does the rest).
const FORM_CSS = `
.pp-sheet h1 { font-size: 16pt; margin: 8pt 0 8pt; text-align: center; }
.pp-sheet h2 { font-size: 13pt; margin: 10pt 0 3pt; }
.pp-sheet h3 { font-size: 12pt; margin: 8pt 0 2pt; }
.pp-sheet h4 { font-size: 12pt; margin: 6pt 0 2pt; }
.pp-sheet .erp-title { text-align: center; font-size: 16pt; margin: 8pt 0; }
.pp-sheet .erp-record-title { text-align: center; font-size: 16pt; margin: 0 0 4pt; }
.erp-center, .pp-sheet .erp-centered { text-align: center; }
.erp-nw { white-space: nowrap; }
.erp-mast { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; border-bottom: 1.5pt solid #000; padding-bottom: 3pt; font-weight: 700; }
.erp-brand-mark { font-size: 18pt; letter-spacing: 1pt; }
.erp-brand-right { text-align: right; }
.erp-notice { border: 1.5pt solid #000; padding: 4pt 8pt; font-weight: 700; }
.erp-fields { display: flex; flex-wrap: wrap; gap: 5pt 16pt; margin: 8pt 0 2pt; }
.erp-field { flex: 1 1 auto; display: flex; align-items: baseline; gap: 6pt; min-width: 0; }
.erp-field b { flex-shrink: 0; }
.erp-fill { flex: 1; min-width: 0.6in; border-bottom: 1px solid #000; padding: 0 2pt 1pt; }
.erp-inline-fill { display: inline-block; min-width: 1.4in; border-bottom: 1px solid #000; padding: 0 4pt; }
.erp-inline-short { min-width: 0.8in; }
.erp-reasons { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, auto); justify-content: space-between; gap: 2pt 12pt; }
.erp-table { width: 100%; border-collapse: collapse; margin: 2pt 0 6pt; }
.erp-table th, .erp-table td { border: 1px solid #000; padding: 3pt 4pt; text-align: left; vertical-align: middle; overflow-wrap: break-word; }
.erp-table th { font-weight: 700; vertical-align: bottom; }
.erp-table thead { display: table-header-group; }
.erp-table tr { break-inside: avoid; page-break-inside: avoid; }
.erp-auth { table-layout: fixed; }
.erp-auth th, .erp-auth td { text-align: center; padding: 3pt 3pt; }
.erp-auth svg { margin: 0 auto; }
.erp-history td:first-child { width: 1%; }
.erp-signline { display: flex; align-items: flex-end; gap: 6pt; margin: 8pt 0 2pt; break-inside: avoid; }
.erp-signline b { flex-shrink: 0; }
.erp-fill-sign { display: flex; align-items: flex-end; gap: 8pt; min-height: 34px; }
.erp-fill-date { flex: 0 0 1.2in; }
.erp-printed { padding-bottom: 2pt; }
.pp-sheet .erp-siteuse { margin: 10pt 0 0; padding-top: 4pt; border-top: 5pt solid #000; line-height: 1.6; break-inside: avoid; }
.erp-sitting { margin: 0 0 8pt; padding-left: 8pt; border-left: 2pt solid #000; break-inside: avoid; }
.erp-sitting p { margin: 0 0 2pt; }
.erp-foot { display: flex; justify-content: space-between; gap: 12pt; margin-top: 10pt; }

/* The form page is set like the paper form, so it stays on one page with up to three date ranges. */
.pp-sheet.erp-form { font-size: 11pt; line-height: 1.25; }
.pp-sheet.erp-form h2, .pp-sheet.erp-form h3 { font-size: 12pt; margin: 5pt 0 1pt; }
.pp-sheet.erp-form .erp-sub { font-size: 11pt; margin: 3pt 0 1pt; }
.pp-sheet.erp-form .erp-title { margin: 5pt 0 2pt; }
.pp-sheet.erp-form .erp-title { font-size: 15pt; }
.pp-sheet.erp-form .erp-legal { font-size: 9.5pt; line-height: 1.18; margin: 0 0 3pt; }
.pp-sheet.erp-form .erp-notice { font-size: 10pt; padding: 3pt 6pt; margin: 2pt 0 4pt; }
.pp-sheet.erp-form .erp-fields { margin: 6pt 0 0; gap: 4pt 14pt; }
.pp-sheet.erp-form .erp-auth th, .pp-sheet.erp-form .erp-auth td { font-size: 10pt; line-height: 1.15; }
.pp-sheet.erp-form .erp-signline { margin: 4pt 0 0; }
.pp-sheet.erp-form .erp-fill-sign { min-height: 30px; }
.pp-sheet.erp-form .erp-siteuse { margin-top: 8pt; font-size: 10pt; line-height: 1.4; }
.pp-sheet.erp-form .erp-foot { margin-top: 4pt; font-size: 10pt; }
`;
