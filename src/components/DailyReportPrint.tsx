// src/components/DailyReportPrint.tsx — The printable Daily Report (whole site) and Student Daily Report
//
// Built from the day's event log and laid out like the sample reports in
// docs/samples, which follow the CDE PDF Standards: Letter, Arial 12 pt, one
// H1 and Title Case headings, simple tables with a header row that repeats on
// each page, no blank cells, black on white. The site report replaces the
// paper sign-in and sign-out sheet; the student report is one student's day.
// Both list what was still open (a missing check-out, a pickup never
// confirmed, head injury checks not finished), so it is on paper as well.
import React, { useEffect, useMemo, useState } from 'react';
import type { ProgramType, Student } from '../types';
import { AUDIT_EVENT_LABELS, type AuditEvent } from '../services/auditLog';
import { isSupabaseConfigured } from '../supabaseClient';
import { localDateIso } from '../utils/helpers';
import { siteNameForPrint } from '../utils/siteSetup';
import {
    SESSIONS, SESSION_CLOSES, SESSION_LABEL, attendanceSheet, clockOf, closesAt, earlyReleaseNote, formatDuration,
    minutesAttended, openItems, releasedTo, type AttendanceRow, type SessionDay,
} from '../utils/dailyRecord';
import PrintPreview, { Sheet } from './PrintPreview';

const DISTRICT = 'Cajon Valley Union School District';
const PROGRAM_NAME: Record<string, string> = { ASES: 'ASES', ELOP: 'ELO-P' };

const INCIDENT_LABEL: Partial<Record<AuditEvent['type'], string>> = {
    behavior_submitted: 'Green Card behavior ticket',
    we_care_submitted: 'We Care report',
    head_injury_started: 'Head injury report started',
    head_injury_check: 'Head injury check',
};

const dayOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const longDate = (iso: string) => dayOf(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (iso: string) => dayOf(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const zoneName = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZoneName: 'long' }).formatToParts(dayOf(iso)).find(p => p.type === 'timeZoneName')?.value;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** "Veronica Thomas (EDP)" → "Veronica Thomas", for the long tables; the full name is in the details box. */
const shortStaff = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '');
const programsOf = (s?: Student) => (s && s.programs.length > 0 ? s.programs.map(p => PROGRAM_NAME[p] ?? p).join(', ') : undefined);
const nameWithGrade = (name: string, grade: string) => (
    <><span className="dr-name">{name}</span>{grade ? <><br />Grade {grade}</> : null}</>
);

const Fields = ({ rows }: { rows: [string, React.ReactNode][] }) => (
    <dl className="dr-fields">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
);

/** SHA-256 of the entries, so a later printout can show nothing changed. */
const useFingerprint = (events: readonly AuditEvent[]): string | null => {
    const [fingerprint, setFingerprint] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!globalThis.crypto?.subtle) { setFingerprint('Not available on this connection'); return; }
        const data = JSON.stringify(events.map(e => [e.id, e.occurredAt, e.studentId, e.type, e.program ?? null, e.staffName, e.batchId ?? null, e.detail ?? null, e.body ?? null]));
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)).then(buf => {
            if (!cancelled) setFingerprint(`SHA-256 ${[...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')}`);
        });
        return () => { cancelled = true; };
    }, [events]);
    return fingerprint;
};

// ── Cells ────────────────────────────────────────────────────────────────────

const inCell = (d: SessionDay) => (d.checkIn ? clockOf(d.checkIn) : d.undone.length > 0 ? 'Undone' : 'Absent');
const outCell = (d: SessionDay) => (d.checkOut ? clockOf(d.checkOut)
    : !d.checkIn ? 'N/A'
    : d.pickup ? `Pickup started ${clockOf(d.pickup)}, not confirmed` : 'Not checked out');

const leftWith = (p: ProgramType, d: SessionDay): string | undefined => {
    const to = releasedTo(d);
    if (!to || !(d.checkOut || d.pickup)) return undefined;
    return to.startsWith('The school day') ? `${SESSION_LABEL[p]}: to the school day (batch check-out)` : `${SESSION_LABEL[p]}: ${to}`;
};

const notesFor = (r: AttendanceRow): string => {
    const notes: string[] = [];
    SESSIONS.forEach(p => {
        const d = r.sessions[p];
        const left = leftWith(p, d);
        if (left) notes.push(left);
        const early = earlyReleaseNote(d);
        if (early) notes.push(`Early release, ${early}`);
        d.undone.forEach(u => notes.push(`${SESSION_LABEL[p]} check-in undone at ${clockOf(u)} (correction)`));
    });
    return notes.length > 0 ? `${notes.join('. ')}.` : 'None';
};

// ── Sections ─────────────────────────────────────────────────────────────────

const NeedsAttention = ({ events, students, date, oneStudent }: { events: readonly AuditEvent[]; students: readonly Student[]; date: string; oneStudent: boolean }) => {
    const items = openItems(events, students, date);
    return (
        <>
            <h2>Needs Attention</h2>
            <p className="dr-intro">
                Checked the same day: a check-in with no check-out, a pickup that was never confirmed, or head injury checks not
                finished. An item is flagged once its session has closed (Sunrise {closesAt('sunrise')}, Sunset {closesAt('sunset')}).
            </p>
            {items.length === 0 ? (
                <p><strong>Nothing is missing.</strong> Every check-in has a check-out, every pickup was confirmed, and every head injury check was recorded.</p>
            ) : (
                <table className="dr-table dr-attention">
                    <caption>Open items{oneStudent ? '' : ', flagged first'}</caption>
                    <colgroup>{!oneStudent && <col className="c-student" />}<col className="c-what" /><col /></colgroup>
                    <thead><tr>{!oneStudent && <th scope="col">Student</th>}<th scope="col">What Is Missing</th><th scope="col">Details</th></tr></thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id}>
                                {!oneStudent && <td>{nameWithGrade(item.name, item.grade)}</td>}
                                <td><strong>{item.title}</strong>{item.overdue ? <><br />Flagged</> : <><br />Still open</>}</td>
                                <td>{item.detail}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </>
    );
};

const Glance = ({ events, rows }: { events: readonly AuditEvent[]; rows: AttendanceRow[] }) => {
    const students = (p: ProgramType | null, test: (d: SessionDay) => boolean) =>
        rows.filter(r => (p ? test(r.sessions[p]) : SESSIONS.some(q => test(r.sessions[q])))).length;
    const entries = (p: ProgramType | null, type: AuditEvent['type']) => events.filter(e => e.type === type && (!p || e.program === p)).length;
    const checkedIn = (d: SessionDay) => !!d.checkIn;
    const notOut = (d: SessionDay) => !!d.checkIn && !d.checkOut;
    const dayIn = students(null, checkedIn);
    const dayNotOut = students(null, notOut);

    const lines: [string, (p: ProgramType) => number | string, number | string][] = [
        ['Students checked in', p => students(p, checkedIn), `${dayIn} (different students)`],
        ['Students checked out', p => students(p, d => !!d.checkIn && !!d.checkOut), `${dayIn - dayNotOut} (different students)`],
        ['Not checked out', p => students(p, notOut), dayNotOut],
        ['Early releases (form on file)', p => students(p, d => !!earlyReleaseNote(d)), students(null, d => !!earlyReleaseNote(d))],
        ['Check-ins undone (corrections)', p => entries(p, 'check_in_undone'), entries(null, 'check_in_undone')],
        ['Green Card behavior tickets', p => entries(p, 'behavior_submitted'), entries(null, 'behavior_submitted')],
        ['We Care reports', p => entries(p, 'we_care_submitted'), entries(null, 'we_care_submitted')],
        ['Head injury reports', p => entries(p, 'head_injury_started'), entries(null, 'head_injury_started')],
        ['Parent letters sent', () => 'N/A', entries(null, 'parent_report_sent')],
    ];
    return (
        <table className="dr-table dr-glance">
            <caption>Totals for the day</caption>
            <thead><tr><th scope="col">Measure</th><th scope="col" className="dr-num">Sunrise</th><th scope="col" className="dr-num">Sunset</th><th scope="col" className="dr-num">Whole Day</th></tr></thead>
            <tbody>
                {lines.map(([label, per, whole]) => (
                    <tr key={label}><th scope="row">{label}</th><td className="dr-num">{per('sunrise')}</td><td className="dr-num">{per('sunset')}</td><td className="dr-num">{whole}</td></tr>
                ))}
            </tbody>
        </table>
    );
};

const AttendanceSheet = ({ rows }: { rows: AttendanceRow[] }) => (
    <>
        <h2>Attendance Sheet</h2>
        <p className="dr-intro">One row per student who checked in, by grade (TK, K, then 1 to 5) and then by first name, the same order as the app's roster. This replaces the paper sign-in and sign-out sheet.</p>
        {rows.length === 0 ? <p>No student checked in on this day.</p> : (
            <table className="dr-table dr-sheet">
                <caption>Sign-in and sign-out times by student</caption>
                <colgroup><col className="c-student" /><col className="c-time" /><col className="c-time" /><col className="c-time" /><col className="c-time" /><col /></colgroup>
                <thead>
                    <tr><th scope="col">Student</th><th scope="col">Sunrise In</th><th scope="col">Sunrise Out</th><th scope="col">Sunset In</th><th scope="col">Sunset Out</th><th scope="col">Released To and Notes</th></tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.studentId}>
                            <td><span className="dr-name">{r.name}</span><br />{[r.grade && `Grade ${r.grade}`, r.student?.elopId && `ID ${r.student.elopId}`].filter(Boolean).join(' · ') || 'Not on the roster'}</td>
                            <td>{inCell(r.sessions.sunrise)}</td>
                            <td>{outCell(r.sessions.sunrise)}</td>
                            <td>{inCell(r.sessions.sunset)}</td>
                            <td>{outCell(r.sessions.sunset)}</td>
                            <td>{notesFor(r)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </>
);

/** Who the student left with, for one session: a name, the school day, or N/A. */
const releasedCell = (d: SessionDay): string => {
    const to = releasedTo(d);
    if (!to || !(d.checkOut || d.pickup)) return 'N/A';
    return to.startsWith('The school day') ? 'The school day (batch check-out)' : to;
};

const StudentGlance = ({ row }: { row?: AttendanceRow }) => {
    const total = row ? SESSIONS.reduce((sum, p) => sum + (minutesAttended(row.sessions[p]) ?? 0), 0) : 0;
    const early = row ? SESSIONS.map(p => earlyReleaseNote(row.sessions[p])).find(Boolean) : undefined;
    const corrections = row ? SESSIONS.flatMap(p => row.sessions[p].undone.map(u => `${SESSION_LABEL[p]} check-in undone at ${clockOf(u)} by ${u.staffName}`)) : [];
    return (
        <>
            <table className="dr-table dr-oneday">
                <caption>Attendance for the day</caption>
                <colgroup><col className="c-session" /><col /><col /><col /><col className="c-total" /></colgroup>
                <thead><tr><th scope="col">Session</th><th scope="col">Checked In</th><th scope="col">Checked Out</th><th scope="col">Released To</th><th scope="col">Time Attended</th></tr></thead>
                <tbody>
                    {SESSIONS.map(p => {
                        const d = row?.sessions[p] ?? { undone: [] };
                        const mins = minutesAttended(d);
                        return (
                            <tr key={p}>
                                <th scope="row">{SESSION_LABEL[p]}</th>
                                <td>{d.checkIn ? <>{clockOf(d.checkIn)}<br />by {shortStaff(d.checkIn.staffName)}</> : inCell(d)}</td>
                                <td>{d.checkOut ? <>{clockOf(d.checkOut)}<br />by {shortStaff(d.checkOut.staffName)}</> : outCell(d)}</td>
                                <td>{releasedCell(d)}</td>
                                <td>{mins === null ? 'N/A' : formatDuration(mins)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <Fields rows={[
                ['Total time', total > 0 ? formatDuration(total) : 'None'],
                ['Early release', early ? `Yes, under a signed Early Release Form: ${early}` : 'No'],
                ['Corrections', corrections.length > 0 ? corrections.join('; ') : 'None'],
            ]} />
        </>
    );
};

const Incidents = ({ events, names, oneStudent }: { events: readonly AuditEvent[]; names: (e: AuditEvent) => React.ReactNode; oneStudent: boolean }) => {
    const list = events.filter(e => INCIDENT_LABEL[e.type]);
    return (
        <>
            <h2>Incident Reports</h2>
            {list.length === 0 ? <p>None. No Green Card, We Care or head injury report was filed.</p> : (
                <>
                    <p className="dr-intro">Each entry as the event log recorded it. The full report is on the student's record in the app.</p>
                    <table className="dr-table dr-incidents">
                        <caption>Incident reports and checks</caption>
                        <colgroup><col className="c-time" />{!oneStudent && <col className="c-student" />}<col className="c-report" /><col /><col className="c-staff" /></colgroup>
                        <thead><tr><th scope="col">Time</th>{!oneStudent && <th scope="col">Student</th>}<th scope="col">Report</th><th scope="col">Details</th><th scope="col">Staff</th></tr></thead>
                        <tbody>
                            {list.map(e => (
                                <tr key={e.id}>
                                    <td className="dr-nw">{clockOf(e)}</td>
                                    {!oneStudent && <td>{names(e)}</td>}
                                    <td>{INCIDENT_LABEL[e.type]}</td>
                                    <td>{e.detail || 'None'}</td>
                                    <td>{shortStaff(e.staffName)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </>
    );
};

const Letters = ({ events, nameOf }: { events: readonly AuditEvent[]; nameOf: (e: AuditEvent) => string }) => {
    const letters = events.filter(e => e.type === 'parent_report_sent');
    return (
        <>
            <h2>Parent Letters</h2>
            {letters.length === 0 ? <p>No letters were sent on this day.</p> : (
                <>
                    <p className="dr-intro">Each letter appears exactly as it was approved and sent, after Lead review.</p>
                    {letters.map((e, i) => (
                        <section key={e.id} className="dr-box" aria-label={`Letter ${i + 1}`}>
                            <h3>Letter {i + 1}: {nameOf(e)}</h3>
                            <Fields rows={[
                                ['Sent', `${clockOf(e)}`],
                                ['Approved by', e.staffName],
                                ['Recorded as', e.detail || 'Parent letter'],
                            ]} />
                            {e.body ? <div className="dr-letter">{e.body}</div> : <p>The letter text was not saved with this entry.</p>}
                        </section>
                    ))}
                </>
            )}
        </>
    );
};

const ActivityLog = ({ events, names, oneStudent }: { events: readonly AuditEvent[]; names: (e: AuditEvent) => React.ReactNode; oneStudent: boolean }) => {
    const groups: [string, string, AuditEvent[]][] = [
        ['Sunrise Session', 'Sunrise entries', events.filter(e => e.program === 'sunrise')],
        ['Sunset Session', 'Sunset entries', events.filter(e => e.program === 'sunset')],
        ['Other Entries', 'Entries not tied to a session, such as parent letters', events.filter(e => !e.program)],
    ];
    return (
        <>
            <h2 className="dr-break">Activity Log</h2>
            <p className="dr-intro">Every entry, in the order it happened. Each row is a permanent entry; an undone check-in appears as its own row rather than erasing the first. Staff are listed by name; see {oneStudent ? 'Student Details' : 'Record Details'} for their organization.</p>
            {events.length === 0 && <p>Nothing was recorded on this day.</p>}
            {groups.filter(([, , list]) => list.length > 0).map(([heading, caption, list]) => (
                <React.Fragment key={heading}>
                    <h3>{heading}</h3>
                    <table className="dr-table dr-log">
                        <caption>{caption}</caption>
                        <colgroup><col className="c-time" />{!oneStudent && <col className="c-student" />}<col /><col className="c-staff" /></colgroup>
                        <thead><tr><th scope="col">Time</th>{!oneStudent && <th scope="col">Student</th>}<th scope="col">Action and Details</th><th scope="col">Staff</th></tr></thead>
                        <tbody>
                            {list.map(e => (
                                <tr key={e.id}>
                                    <td className="dr-nw">{clockOf(e)}</td>
                                    {!oneStudent && <td>{names(e)}</td>}
                                    <td><strong>{AUDIT_EVENT_LABELS[e.type]}</strong>{e.detail ? <><br />{e.detail}</> : null}</td>
                                    <td>{shortStaff(e.staffName)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </React.Fragment>
            ))}
        </>
    );
};

const Terms = () => (
    <>
        <h2>Terms Used in This Report</h2>
        <Fields rows={[
            ['Sunrise', `Before-school session. It closes with the batch check-out when school starts (${closesAt('sunrise')}).`],
            ['Sunset', `After-school session, until ${closesAt('sunset')}.`],
            ['Batch check-out', 'The scheduled Sunrise check-out when school starts.'],
            ['Group check-in', 'Several students checked in together with one tap. Each still has their own entry.'],
            ['Correction', 'An undone check-in. The original entry stays on file and the undo is a new entry.'],
            ['Early release', "Leaving Sunset early under a signed Early Release Form. The reason number is the one on the district's form."],
            ['Flagged', 'Not finished when its session closed, or by the end of an earlier day.'],
        ]} />
    </>
);

// ── The report ───────────────────────────────────────────────────────────────

interface DailyReportPrintProps {
    /** YYYY-MM-DD */
    date: string;
    /** The day's entries, oldest first, already narrowed to the grade or student shown. */
    events: readonly AuditEvent[];
    students: readonly Student[];
    /** Set for a Student Daily Report. */
    student?: Student;
    /** What the site report covers, e.g. "All grades" or "Grade 4". */
    scope?: string;
    /** Why the entries may be incomplete (the database read failed or was cut off). */
    incomplete?: string;
    onClose: () => void;
}

const DailyReportPrint = ({ date, events, students, student, scope = 'All grades', incomplete, onClose }: DailyReportPrintProps) => {
    const site = useMemo(siteNameForPrint, []);
    const fingerprint = useFingerprint(events);
    const printedAt = useMemo(() => new Date(), []);
    const rows = useMemo(() => attendanceSheet(events, students), [events, students]);
    const byId = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

    const oneStudent = !!student;
    const studentName = student ? `${student.firstName} ${student.lastName}` : '';
    const nameOf = (e: AuditEvent) => { const s = byId.get(e.studentId); return s ? `${s.firstName} ${s.lastName}` : e.studentName; };
    // One line in the long tables: "Ava Martinez (TK)".
    const names = (e: AuditEvent) => { const g = byId.get(e.studentId)?.grade; return <><span className="dr-name">{nameOf(e)}</span>{g ? ` (${g})` : ''}</>; };
    const staff = [...new Set(events.map(e => e.staffName))].sort();
    const zone = zoneName(date);

    const isToday = date === localDateIso(printedAt);
    const [ch, cm] = SESSION_CLOSES.sunset.split(':').map(Number);
    const dayOpen = isToday && printedAt < new Date(printedAt.getFullYear(), printedAt.getMonth(), printedAt.getDate(), ch, cm);
    const printedText = printedAt.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

    const localOnly = events.filter(e => e.localOnly).length;
    const failed = events.filter(e => !e.persisted && !e.localOnly).length;
    const saved = events.length - localOnly - failed;
    const notices = [
        events.length > 0 && localOnly === events.length && 'Sample record, demonstration data only. These entries were kept on this device and were not saved to the database.',
        localOnly > 0 && localOnly < events.length && `${count(localOnly, 'entry', 'entries')} for students added this session ${localOnly === 1 ? 'was' : 'were'} not saved to the database.`,
        failed > 0 && `${count(failed, 'entry', 'entries')} failed to save to the database and ${failed === 1 ? 'is' : 'are'} on this device only.`,
        incomplete,
        dayOpen && `Printed at ${printedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, while the day is still in progress. Later entries are not included, and students still checked in are not flagged until their session closes.`,
    ].filter((n): n is string => !!n);

    const kind = oneStudent ? 'EDP Student Daily Report' : 'EDP Daily Report';
    const subject = oneStudent ? studentName : site;
    const footer = oneStudent ? `${studentName} · Grade ${student!.grade} · ${shortDate(date)}` : `EDP Daily Report · ${site} · ${shortDate(date)}`;
    const font = '12pt Arial, Helvetica, sans-serif';

    return (
        <PrintPreview
            documentTitle={oneStudent ? `${kind} - ${studentName} - Grade ${student!.grade} - ${shortDate(date)}` : `${kind} - ${site} - ${shortDate(date)}`}
            label={`Print preview · ${kind}, ${shortDate(date)}`}
            margin="0.6in 0.6in 0.75in"
            pageRules={`@bottom-left { content: ${cssString(footer)}; font: ${font}; color: #000; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: ${font}; color: #000; }`}
            css={REPORT_CSS}
            onClose={onClose}
        >
            <Sheet label={`${kind}: ${subject}, ${shortDate(date)}`}>
                <header className="dr-mast">
                    <h1><span className="dr-kind">{kind}:&nbsp;</span><br />{subject}, {shortDate(date)}</h1>
                    <p className="dr-sub">{oneStudent ? `${site} · Extended Day Program` : `${DISTRICT} · Extended Day Program`}</p>
                    <p className="dr-tag">{oneStudent ? `${DISTRICT} · ` : ''}Attendance and Incident Record</p>
                </header>

                {notices.length > 0 && (
                    <section className="dr-box dr-dashed" aria-label="About this copy">
                        {notices.map(n => <p key={n}><strong>{n}</strong></p>)}
                    </section>
                )}

                {oneStudent ? (
                    <section className="dr-box" aria-labelledby="dr-details">
                        <h2 id="dr-details">Student Details</h2>
                        <Fields rows={[
                            ['Student', <span className="dr-name">{studentName}</span>],
                            ['Grade', student!.grade],
                            ['Student ID', [student!.elopId && `ELO-P ${student!.elopId}`, student!.asesId && `ASES ${student!.asesId}`].filter(Boolean).join(' · ') || 'None on file'],
                            ['Programs', programsOf(student) ?? 'None on file'],
                            ['Date', `${longDate(date)}${zone ? ` (${zone})` : ''}`],
                            ['School', site],
                            ['Pickup contacts', student!.guardians.length === 0 ? 'None on file' : (
                                <>{student!.guardians.map(g => (
                                    <React.Fragment key={g.type}>{g.type}: {g.firstName} {g.lastName}{g.relationship ? ` (${g.relationship})` : ''}{g.authStatus === 'pending' ? ', approval pending' : ''}<br /></React.Fragment>
                                ))}</>
                            )],
                            ['Staff with entries', staff.length > 0 ? staff.join(', ') : 'None'],
                        ]} />
                    </section>
                ) : (
                    <section className="dr-box" aria-labelledby="dr-details">
                        <h2 id="dr-details">Record Details</h2>
                        <Fields rows={[
                            ['Site', site],
                            ['Date', `${longDate(date)}${zone ? ` (${zone})` : ''}`],
                            ['Covers', scope],
                            ['Sessions', `Sunrise (before school), closes ${closesAt('sunrise')}. Sunset (after school), closes ${closesAt('sunset')}.`],
                            ['Staff with entries', staff.length > 0 ? staff.join(', ') : 'None'],
                            ['Record status', `${count(events.length, 'entry', 'entries')}. Entries are never edited or deleted; corrections appear as new entries.${isSupabaseConfigured ? ` Saved to the database: ${saved} of ${events.length}.` : ''}`],
                            ['Printed', `${printedText}, from the EDP Attendance app for ${DISTRICT}`],
                        ]} />
                    </section>
                )}

                <NeedsAttention events={events} students={students} date={date} oneStudent={oneStudent} />

                <h2>Day at a Glance</h2>
                {oneStudent ? <StudentGlance row={rows[0]} /> : <Glance events={events} rows={rows} />}

                {!oneStudent && <AttendanceSheet rows={rows} />}
                <Incidents events={events} names={names} oneStudent={oneStudent} />
                <Letters events={events} nameOf={nameOf} />
                <ActivityLog events={events} names={names} oneStudent={oneStudent} />
                <Terms />

                <section className="dr-box" aria-labelledby="dr-integrity">
                    <h2 id="dr-integrity">Record Integrity</h2>
                    <p>Built from the EDP Attendance event log, which is append-only: no entry can be edited or deleted, and each one records who made it and when.</p>
                    <Fields rows={[
                        ['Entries', String(events.length)],
                        ['Fingerprint', <span className="dr-break-all">{fingerprint ?? 'Calculating'}</span>],
                        ['How to verify', `Print this ${oneStudent ? 'student and day' : 'day'} again from the app. The same fingerprint means no entry has been added or changed since.`],
                    ]} />
                </section>

                {!oneStudent && (
                    <section className="dr-box dr-dashed" aria-labelledby="dr-review">
                        <h2 id="dr-review">Lead Review for Printed Copies</h2>
                        <div className="dr-sign"><div>Reviewed by (print name)</div><div>Signature</div><div>Date</div></div>
                    </section>
                )}
            </Sheet>
        </PrintPreview>
    );
};

export default DailyReportPrint;

const REPORT_CSS = `
.dr-mast { border-top: 4pt solid #000; border-bottom: 1pt solid #000; padding: 10pt 0 8pt; text-align: center; margin-bottom: 12pt; }
.dr-mast h1 { font-size: 20pt; margin: 0 0 6pt; line-height: 1.15; }
.dr-mast .dr-kind { font-size: 15pt; }
.dr-mast .dr-sub { font-size: 13pt; font-weight: 700; margin: 0; }
.dr-mast .dr-tag { font-size: 12pt; margin: 2pt 0 0; }
.pp-sheet h2 { font-size: 15pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1pt solid #000; }
.pp-sheet h3 { font-size: 13pt; margin: 10pt 0 4pt; }
.dr-break { break-before: page; page-break-before: always; }
.dr-intro { break-after: avoid; page-break-after: avoid; }
.dr-box { border: 1.25pt solid #000; padding: 9pt 14pt 7pt; margin: 8pt 0 10pt; break-inside: avoid; }
.dr-box.dr-dashed { border-style: dashed; }
.dr-box > h2:first-child, .dr-box > h3:first-child { margin-top: 0; font-size: 13pt; padding-bottom: 4pt; border-bottom: 0.75pt solid #000; }
.dr-box p:last-child { margin-bottom: 2pt; }
.dr-fields { margin: 6pt 0; }
.dr-fields > div { display: grid; grid-template-columns: 1.75in 1fr; gap: 8pt; padding: 1.5pt 0; break-inside: avoid; }
.dr-fields dt { font-weight: 700; }
.dr-fields dd { margin: 0; }
.dr-table { width: 100%; border-collapse: collapse; margin: 4pt 0 12pt; table-layout: fixed; }
.dr-table caption { caption-side: top; text-align: left; font-weight: 700; padding-bottom: 4pt; }
.dr-table th, .dr-table td { border: 0.75pt solid #000; padding: 3pt 6pt; text-align: left; vertical-align: top; overflow-wrap: break-word; }
.dr-table thead { display: table-header-group; }
.dr-table thead th { border-bottom: 2pt solid #000; }
.dr-table tr { break-inside: avoid; page-break-inside: avoid; }
.dr-table tbody th { font-weight: 400; }
.dr-glance { table-layout: auto; }
.dr-oneday, .dr-glance { break-inside: avoid; page-break-inside: avoid; }
.dr-num { text-align: right !important; }
.dr-nw { white-space: nowrap; }
.dr-name { font-weight: 700; }
.dr-break-all { word-break: break-all; }
.c-student { width: 1.85in; } .c-time { width: 0.85in; } .c-session { width: 0.95in; } .c-staff { width: 1.55in; }
.c-what { width: 2.1in; } .c-report { width: 1.6in; } .c-total { width: 1.1in; }
.dr-letter { border: 0.75pt solid #000; padding: 8pt 12pt; margin: 6pt 0 2pt; white-space: pre-wrap; }
.dr-sign { display: grid; grid-template-columns: 1fr 1fr 0.8fr; gap: 18pt; margin-top: 24pt; }
.dr-sign div { border-top: 0.75pt solid #000; padding-top: 3pt; }
`;
