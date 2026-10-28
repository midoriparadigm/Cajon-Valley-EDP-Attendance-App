// Builds the sample EDP reports (the locked audit trail) and prints them to tagged PDFs,
// in the folder layout they would have in Google Drive:
//   Sample Elementary EDP/2026-27/Daily Reports/edp-daily-2026-10-27.pdf      every student, one day
//   Sample Elementary EDP/2026-27/Grade 2/Liam Smith/edp-2026-10-27-1012.pdf  one student, one day
// Usage: node docs/samples/make-record-samples.mjs [output folder]   (default: docs/samples)
// Needs Google Chrome; set CHROME to its path if it isn't in /Applications.
// All data below is made up for demonstration.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUT = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── Sample data ─────────────────────────────────────────────────────────────
const DAY = 'Tuesday, October 27, 2026';
const DAY_SHORT = 'October 27, 2026';
const DAY_ISO = '2026-10-27';
const DAY_NUMERIC = '10/27/2026'; // as the pickup text writes it
const DISTRICT = 'Cajon Valley Union School District';
const SITE = 'Sample Elementary School';
const SITE_ADDR = '123 Example Avenue, El Cajon, CA 92020 (sample address)';
const SITE_GEO = '32.79480, -116.96250';
const SITE_ID = 'EDP-SAMPLE-ELEM';
const DRIVE_ROOT = 'Sample Elementary EDP';
const SCHOOL_YEAR = '2026-27';
const EARLY_RELEASE_BEFORE = '5:00 PM';

const SESSIONS = {
    sunrise: { label: 'Sunrise', hours: '7:00 AM to 8:00 AM', short: '7:00 to 8:00 AM', when: 'before school', what: 'Before-school session.' },
    sunset: { label: 'Sunset', hours: '2:45 PM to 6:00 PM', short: '2:45 to 6:00 PM', when: 'after school', what: 'After-school session.' },
};

const STAFF = {
    vt: 'Veronica Thomas',
    cm: 'Coach Mike',
    do: 'Daniel Ortiz',
};
const ROLE = { [STAFF.vt]: 'EDP Lead', [STAFF.do]: 'EDP Assistant', [STAFF.cm]: 'Coach (549 Sports)' };

const PROGRAM_NAMES = {
    ASES: 'After School Education and Safety Program',
    'ELO-P': 'Expanded Learning Opportunities Program',
};

const S = {
    ava: { name: 'Ava Garcia', grade: 'K', program: 'ELO-P', id: '1007', c1: 'Rosa Garcia (Mother)' },
    liam: { name: 'Liam Smith', grade: '2', program: 'ASES', id: '1012', c1: 'Jennifer Smith (Mother)' },
    noor: { name: 'Noor Ali', grade: '3', program: 'ASES, ELO-P', id: '1015', c1: 'Samir Ali (Father)' },
    mateo: { name: 'Mateo Rodriguez', grade: '1', program: 'ELO-P', id: '1021', c1: 'Carmen Rodriguez (Mother)' },
    sofia: { name: 'Sofia Yako', grade: 'TK', program: 'ELO-P', id: '1030', c1: 'Maria Yako (Mother)', c2: 'Elena Yako (Grandmother)' },
    omarH: { name: 'Omar Hannosh', grade: '4', program: 'ASES', id: '1033', c1: 'Nabil Hannosh (Father)' },
    omarK: { name: 'Omar Khan', grade: '4', program: 'ASES', id: '1034', c1: 'Huda Khan (Mother)' },
    emma: { name: 'Emma Wilson', grade: '5', program: 'ASES', id: '1041', c1: 'Linda Wilson (Mother)' },
    dan: { name: 'Daniel Johnson', grade: '3', program: 'ELO-P', id: '1045', c1: 'Michael Johnson (Father)' },
};

// Roster order, as in the app (src/App.tsx): grade (TK, K, then 1 to 5), then first name, then last name.
const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];
const rosterOrder = (a, b) => {
    const [firstA, lastA] = S[a].name.split(' '), [firstB, lastB] = S[b].name.split(' ');
    return GRADES.indexOf(S[a].grade) - GRADES.indexOf(S[b].grade) || firstA.localeCompare(firstB) || lastA.localeCompare(lastB);
};
const byRoster = keys => [...keys].sort(rosterOrder);

// California Department of Education's recommended early release reasons.
const EARLY_REASONS = {
    1: 'School athletics and team sports', 2: 'Off-site enrichment', 3: 'Family emergency', 4: 'Medical appointment',
    5: 'Transportation', 6: 'Child accident or injury', 7: 'Safety (darkness, weather)', 8: 'Other (reason stated)',
};

let geoN = 0;
const onSite = () => {
    // Small, repeatable variation around the site point, as a phone's GPS would give.
    geoN += 1;
    const lat = (32.79480 + ((geoN * 7) % 9 - 4) * 0.00003).toFixed(5);
    const lon = (-116.96250 + ((geoN * 5) % 9 - 4) * 0.00003).toFixed(5);
    const acc = 6 + ((geoN * 3) % 9);
    return { kind: 'On site', coords: `${lat}, ${lon}`, acc: `±${acc} m` };
};
const SCHEDULED = { kind: 'N/A', note: 'scheduled' };

// session: 'sunrise' | 'sunset'. extra: group, ref ({ report } or { letter }), reason, location.
const ev = (time, session, student, action, detail, staff, extra = {}) =>
    ({ time, session, student, action, detail, staff, ...extra, location: extra.location ?? onSite() });

const sunriseGroup = 'G-0714';
const sunsetGroup = 'G-1447';
const EVENTS = [
    ev('7:10 AM', 'sunrise', 'ava', 'Checked in', '', STAFF.vt),
    ...byRoster(['liam', 'noor', 'mateo', 'sofia']).map(k => ev('7:14 AM', 'sunrise', k, 'Checked in', `Group of 4 (${sunriseGroup})`, STAFF.vt, { group: sunriseGroup })),
    ev('7:31 AM', 'sunrise', 'omarK', 'Checked in', '', STAFF.vt),
    ev('7:32 AM', 'sunrise', 'omarK', 'Check-in undone (correction)', 'Wrong student selected. Correction text sent to the family.', STAFF.vt),
    ev('7:32 AM', 'sunrise', 'omarH', 'Checked in', '', STAFF.vt),
    ...byRoster(['ava', 'liam', 'noor', 'mateo', 'sofia', 'omarH']).map(k => ev('8:00 AM', 'sunrise', k, 'Checked out', 'Batch, to school day', STAFF.vt, { location: SCHEDULED })),

    ...byRoster(['liam', 'noor', 'mateo', 'omarH', 'omarK', 'emma']).map(k => ev('2:47 PM', 'sunset', k, 'Checked in', `Group of 6 (${sunsetGroup})`, STAFF.cm, { group: sunsetGroup })),
    ev('2:51 PM', 'sunset', 'ava', 'Checked in', '', STAFF.do),
    ev('2:53 PM', 'sunset', 'sofia', 'Checked in', '', STAFF.do),
    ev('2:58 PM', 'sunset', 'dan', 'Checked in', '', STAFF.do),
    ev('3:40 PM', 'sunset', 'liam', 'Green Card filed', 'Level 1 (Green), 2 behaviors.', STAFF.cm, { ref: { report: 'gc' } }),
    ev('3:46 PM', 'sunset', 'liam', 'Green Card edited', 'Edited within 10-minute window.', STAFF.cm, { ref: { report: 'gc' } }),
    ev('4:05 PM', 'sunset', 'noor', 'We Care report filed', 'Gaga Ball. First aid: ice, rest.', STAFF.do, { ref: { report: 'wc' } }),
    ev('4:09 PM', 'sunset', 'sofia', 'Pickup contact added', 'Elena Yako (Grandmother) as Contact 2. Approval request texted to Maria Yako (Mother).', STAFF.vt),
    ev('4:12 PM', 'sunset', 'sofia', 'Pickup contact approved', 'Elena Yako (Grandmother, Contact 2). Approved by Maria Yako (Mother) by phone.', STAFF.vt),
    ev('4:20 PM', 'sunset', 'mateo', 'Head injury report started', 'Initial check: no symptoms.', STAFF.cm, { ref: { report: 'hi' } }),
    ev('4:31 PM', 'sunset', 'sofia', 'Checked out (early release)', 'To Elena Yako (Grandmother). Reason 4: medical appointment.', STAFF.vt, { reason: 4 }),
    ev('4:35 PM', 'sunset', 'mateo', 'Head injury check', '15-minute check: mild headache.', STAFF.vt, { ref: { report: 'hi' } }),
    ev('4:50 PM', 'sunset', 'mateo', 'Head injury check', '30-minute check: no symptoms.', STAFF.vt, { ref: { report: 'hi' } }),
    ev('5:05 PM', 'sunset', 'mateo', 'Checked out', 'To Carmen Rodriguez (Mother)', STAFF.vt),
    ev('5:20 PM', 'sunset', 'ava', 'Checked out', 'To Rosa Garcia (Mother)', STAFF.vt),
    ev('5:26 PM', 'sunset', 'liam', 'Checked out', 'To Jennifer Smith (Mother)', STAFF.vt),
    ev('5:31 PM', 'sunset', 'noor', 'Checked out', 'To Samir Ali (Father)', STAFF.vt),
    ev('5:40 PM', 'sunset', 'omarH', 'Checked out', 'To Nabil Hannosh (Father)', STAFF.vt),
    ev('5:44 PM', 'sunset', 'omarK', 'Checked out', 'To Huda Khan (Mother)', STAFF.vt),
    ev('5:47 PM', 'sunset', 'dan', 'Checked out', 'To Michael Johnson (Father)', STAFF.vt),
    ev('5:52 PM', 'sunset', 'emma', 'Checked out', 'To Linda Wilson (Mother)', STAFF.vt),
    ev('5:55 PM', 'sunset', 'liam', 'Parent letter sent', 'Green Card letter, email and text.', STAFF.vt, { ref: { letter: 'gc' } }),
    ev('5:57 PM', 'sunset', 'noor', 'Parent letter sent', 'We Care letter, email and text.', STAFF.vt, { ref: { letter: 'wc' } }),
    ev('5:58 PM', 'sunset', 'mateo', 'Parent letter sent', 'Head injury letter, email and text.', STAFF.vt, { ref: { letter: 'hi' } }),
];

const TERMS = {
    batch: ['Batch check-out', 'The scheduled Sunrise check-out when school starts.'],
    group: ['Group ID', 'Shared by the students checked in together with one group check-in.'],
    location: ['Location', 'Where the staff device was for the entry: coordinates, "On site" if within 100 m of the school, and the accuracy the device reported. N/A means no device was involved.'],
    early: ['Early release', `Leaving before the time set by the site's early release policy. Reason codes follow the California Department of Education's recommended list: ${Object.entries(EARLY_REASONS).map(([n, r]) => `${n} ${r}`).join('; ')}.`],
    correction: ['Correction', 'An undone check-in. The original entry stays on file, and the family receives a correction text.'],
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const fields = rows => `<dl class="fields">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
const personName = c => c.replace(/ \(.*$/, '');
const PEOPLE = [
    ...Object.values(S).flatMap(x => [x.name, x.c1, x.c2].filter(Boolean).map(personName)),
    ...Object.values(STAFF),
].sort((a, b) => b.length - a.length);
// Names stay on one line so a PDF search for the full name finds every one.
const keepNames = html => PEOPLE.reduce((h, n) => h.split(n).join(`<span class="nw">${n}</span>`), html);
const nameCell = k => `<span class="name nw">${esc(S[k].name)}</span>`;
const studentCell = k => `<span class="name">${esc(S[k].name)}</span><br>${esc(S[k].id)}`;
const studentLine = k => `${esc(S[k].name)} · Grade ${esc(S[k].grade)} · ${esc(S[k].program)} · ${esc(S[k].id)}`;
// Coordinates stay on one line so they can be searched as typed.
const locationCell = l => (l.kind === 'N/A'
    ? 'N/A (scheduled)'
    : `<span class="nw">${esc(l.coords)}</span><br><span class="nw">On site, ${esc(l.acc)}</span>`);
const locationText = l => `<span class="nw">${esc(l.coords)}</span> (on site, ${esc(l.acc)})`;
const staffWithRole = n => `${keepNames(esc(n))}, ${esc(ROLE[n])}`;
const contactLabel = (k, name) => {
    const s = S[k];
    const which = personName(s.c1) === name ? ['c1', 'Contact 1'] : ['c2', 'Contact 2'];
    return s[which[0]].replace(')', `, ${which[1]})`);
};
const fingerprintOf = events => createHash('sha256').update(JSON.stringify(events)).digest('hex');
const mins = t => { const [, h, m, ap] = t.match(/(\d+):(\d+) (AM|PM)/); return ((h % 12) + (ap === 'PM' ? 12 : 0)) * 60 + Number(m); };
const duration = m => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const isIn = e => e.action === 'Checked in';
const isOut = e => e.action.startsWith('Checked out');
const undone = e => e.action.startsWith('Check-in undone');
const eventsOf = k => EVENTS.filter(e => e.student === k);

/** One student's session: the check-in that stands (an undo cancels the one before it), the check-out, and any undos. */
const sessionDay = (k, session) => {
    const evs = EVENTS.filter(e => e.student === k && e.session === session);
    let checkIn = null;
    const undos = [];
    for (const e of evs) {
        if (isIn(e)) checkIn = e;
        else if (undone(e)) { undos.push({ original: checkIn, undo: e }); checkIn = null; }
    }
    const checkOut = evs.find(isOut);
    const releasedTo = checkOut?.detail.match(/^To (.+?\))/)?.[1];
    return { evs, checkIn, checkOut, undos, releasedTo, minutes: checkIn && checkOut ? mins(checkOut.time) - mins(checkIn.time) : 0 };
};

/** Texts the app sends a family during the day, worded exactly as src/utils/sms.ts sends them. */
const textsFor = k => {
    const s = S[k];
    const first = s.name.split(' ')[0];
    const toC1 = contactLabel(k, personName(s.c1));
    const lastIn = {};
    const out = [];
    for (const e of eventsOf(k)) {
        const tag = `[${SESSIONS[e.session].label}]`;
        if (isIn(e)) {
            lastIn[e.session] = e.time;
            out.push({ time: e.time, to: toC1, msg: `${tag} ${first} has arrived and is checked in at ${e.time}.` });
        } else if (undone(e)) {
            out.push({ time: e.time, to: toC1, msg: `${tag} Please disregard our earlier text: ${first}'s ${lastIn[e.session]} check-in was entered by mistake and has been removed.` });
        } else if (e.action === 'Pickup contact added') {
            out.push({ time: e.time, to: toC1, msg: `Do you authorize ${personName(s.c2)} to be the Contact 2 Guardian who is allowed to pick up ${first}?` });
        } else if (e.session === 'sunset' && isOut(e)) {
            // The person picking up gets the text; Contact 1 also gets it when someone else picks up.
            const by = personName(e.detail.match(/^To (.+?\))/)[1]);
            const msg = `${s.name} was picked up by ${by} from Cajon Valley EDP at ${e.time} on ${DAY_NUMERIC}.`;
            out.push({ time: e.time, to: contactLabel(k, by), msg });
            if (by !== personName(s.c1)) out.push({ time: e.time, to: toC1, msg });
        }
    }
    return out;
};

// Per-document numbering: tables in reading order, reports and letters as they appear.
const newContext = (reportKeys, perStudent = false) => ({
    table: 0,
    perStudent,
    reportN: Object.fromEntries(reportKeys.map((k, i) => [k, i + 1])),
    letterN: Object.fromEntries(reportKeys.map((k, i) => [k, i + 1])),
});
const caption = (ctx, text) => `<caption>Table ${++ctx.table}. ${esc(text)}</caption>`;
const detailHtml = (ctx, e) => {
    const ref = e.ref?.report ? ` Report ${ctx.reportN[e.ref.report]}.` : e.ref?.letter ? ` Letter ${ctx.letterN[e.ref.letter]}.` : '';
    return keepNames(esc(`${e.detail}${ref}`.trim()));
};

/** The activity log: the site report shows every student; a student report leaves out the student columns. */
const logTable = (ctx, events, text, perStudent = false) => `
<table class="log${perStudent ? ' one' : ''}">
  ${caption(ctx, text)}
  <colgroup><col class="c-time">${perStudent ? '' : '<col class="c-student"><col class="c-grade"><col class="c-prog">'}<col class="c-action"><col class="c-staff"><col class="c-loc"></colgroup>
  <thead><tr><th scope="col">Time</th>${perStudent ? '' : '<th scope="col">Student</th><th scope="col">Grade</th><th scope="col">Program</th>'}<th scope="col">Action and Details</th><th scope="col">Staff</th><th scope="col">Location</th></tr></thead>
  <tbody>
${events.map(e => {
        const detail = detailHtml(ctx, e);
        const who = perStudent ? '' : `<td>${nameCell(e.student)}</td><td>${esc(S[e.student].grade)}</td><td class="nw">${esc(S[e.student].program)}</td>`;
        const time = perStudent ? `${esc(e.time)}<br>${SESSIONS[e.session].label}` : esc(e.time);
        return `    <tr><td class="nw">${time}</td>${who}<td><span class="action">${esc(e.action)}</span>${detail ? `<br>${detail}` : ''}</td><td>${keepNames(esc(e.staff))}</td><td>${locationCell(e.location)}</td></tr>`;
    }).join('\n')}
  </tbody>
</table>`;

// ── Reports and letters (shared by the site and student reports) ────────────
const reportEvent = key => EVENTS.find(e => e.ref?.report === key);

const REPORTS = [
    {
        key: 'gc', student: 'liam', title: 'Green Card Behavior Ticket', short: 'Green Card behavior ticket',
        body: ctx => `${fields([
            !ctx.perStudent && ['Student', studentLine('liam')],
            ['Filed', `${esc(DAY_SHORT)} at ${reportEvent('gc').time} (Sunset)`],
            ['Filed by', keepNames(esc(STAFF.cm))],
            ['Handling staff', keepNames(esc(STAFF.cm))],
            ['Staff closest', keepNames(esc(STAFF.do))],
            ['Location', locationText(reportEvent('gc').location)],
            ['Level', 'Level 1 (Green)'],
            ['Edits', 'Edited once at 3:46 PM, within the 10-minute edit window. Both versions are kept in the log.'],
        ])}
  <h4>Behaviors Checked</h4>
  <ul class="plain"><li>Hands-on</li><li>Defiance of staff directions</li></ul>
  <h4>Details of the Incident</h4>
  <p>During the line-up for snack, Liam pushed another student out of line twice after being asked to wait his turn.</p>
  <h4>Actions Taken by Staff</h4>
  <p>Coach Mike moved Liam to the end of the line and talked with him about keeping hands to himself. Liam apologized to the other student and joined the next activity without further issues.</p>
  <p><strong>Parent letter:</strong> Sent at 5:55 PM. See Letter ${ctx.letterN.gc}.</p>`,
    },
    {
        key: 'wc', student: 'noor', title: 'We Care Report', short: 'We Care report',
        body: ctx => `${fields([
            !ctx.perStudent && ['Student', studentLine('noor')],
            ['Filed', `${esc(DAY_SHORT)} at ${reportEvent('wc').time} (Sunset)`],
            ['Filed by', keepNames(esc(STAFF.do))],
            ['Location', locationText(reportEvent('wc').location)],
            ['Activity', 'Gaga Ball'],
        ])}
  <h4>First Aid Given</h4>
  <ul class="plain"><li>Ice</li><li>Rest</li></ul>
  <h4>Additional Information</h4>
  <p>Noor bumped her knee on the gaga pit wall. Staff applied an ice pack for 10 minutes. Noor rested on the bench and returned to play at 4:20 PM.</p>
  <p><strong>Parent letter:</strong> Sent at 5:57 PM. See Letter ${ctx.letterN.wc}.</p>`,
    },
    {
        key: 'hi', student: 'mateo', title: 'Head Injury Report', short: 'Head injury report',
        body: ctx => `${fields([
            !ctx.perStudent && ['Student', studentLine('mateo')],
            ['Started', `${esc(DAY_SHORT)} at ${reportEvent('hi').time} (Sunset)`],
            ['Reported by', keepNames(esc(STAFF.cm))],
            ['Location', locationText(reportEvent('hi').location)],
            ['Status', 'Complete. All three checks were recorded before pickup.'],
        ])}
  <h4>Witness Statement</h4>
  <blockquote><p>Mateo and another student bumped heads while running for the same ball on the field. Mateo sat down right away and said his forehead hurt. No loss of consciousness.</p><p>Reported by Coach Mike at 4:18 PM.</p></blockquote>
  <table class="checks keep">
    ${caption(ctx, 'Head injury checks for Mateo Rodriguez')}
    <colgroup><col class="c-check"><col class="c-time"><col class="c-staff"><col></colgroup>
    <thead><tr><th scope="col">Check</th><th scope="col">Time</th><th scope="col">Staff</th><th scope="col">Symptoms Noted</th></tr></thead>
    <tbody>
      <tr><td>Initial</td><td>4:20 PM</td><td>${keepNames(esc(STAFF.cm))}</td><td>None</td></tr>
      <tr><td>15 minutes</td><td>4:35 PM</td><td>${keepNames(esc(STAFF.vt))}</td><td>Mild headache. Mateo rested in the office with an ice pack.</td></tr>
      <tr><td>30 minutes</td><td>4:50 PM</td><td>${keepNames(esc(STAFF.vt))}</td><td>None</td></tr>
    </tbody>
  </table>
  <p><strong>Released:</strong> 5:05 PM to Carmen Rodriguez (Mother, Contact 1), who was told about the injury in person.</p>
  <p><strong>Parent letter:</strong> Sent at 5:58 PM. See Letter ${ctx.letterN.hi}.</p>`,
    },
];

const LETTERS = [
    {
        key: 'gc', student: 'liam', to: 'Jennifer Smith', time: '5:55 PM',
        subject: 'Green Card note for Liam, October 27',
        body: [
            'Dear Jennifer Smith,',
            'This is to let you know that Liam received a Green Card behavior ticket at EDP today, October 27, at 3:40 PM. Staff noted two behaviors: hands-on, and not following staff directions during the snack line-up.',
            'Coach Mike talked with Liam about keeping his hands to himself, and Liam apologized to the other student. The rest of his afternoon went well.',
            'Please take a moment to talk with Liam about it at home. Thank you for your partnership.',
            'EDP Team, Cajon Valley Union School District',
        ],
    },
    {
        key: 'wc', student: 'noor', to: 'Samir Ali', time: '5:57 PM',
        subject: 'We Care report for Noor, October 27',
        body: [
            'Dear Samir Ali,',
            'We wanted to let you know that Noor bumped her knee while playing Gaga Ball at EDP today, October 27, at about 4:00 PM. Staff gave her an ice pack and she rested for a few minutes before going back to play.',
            'Please reach out if you have any questions.',
            'EDP Team, Cajon Valley Union School District',
        ],
    },
    {
        key: 'hi', student: 'mateo', to: 'Carmen Rodriguez', time: '5:58 PM',
        subject: 'Head injury report for Mateo, October 27',
        body: [
            'Dear Carmen Rodriguez,',
            'As we shared at pickup, Mateo bumped heads with another student during play at EDP today, October 27, at about 4:15 PM. Staff followed our head injury protocol and checked on him right away, at 15 minutes and at 30 minutes. He had a mild headache at the 15-minute check, which had gone by the 30-minute check.',
            'Please keep an eye on Mateo this evening and contact your doctor if you notice a headache that gets worse, vomiting, dizziness, or unusual sleepiness.',
            'EDP Team, Cajon Valley Union School District',
        ],
    },
];

const reportBox = (ctx, r) => `
<section class="box" aria-labelledby="r-${r.key}">
  <h3 id="r-${r.key}">Report ${ctx.reportN[r.key]}: ${esc(r.title)}, ${esc(S[r.student].name)}</h3>
  ${r.body(ctx)}
</section>`;

const letterBox = (ctx, l) => {
    const report = REPORTS.find(r => r.key === l.key);
    const about = report.short;
    return `
<section class="box" aria-labelledby="l-${l.key}">
  <h3 id="l-${l.key}">Letter ${ctx.letterN[l.key]}: ${esc(S[l.student].name)}, ${esc(report.title)}</h3>
  ${fields([
        !ctx.perStudent && ['Student', studentLine(l.student)],
        !ctx.perStudent && ['Regarding', `${esc(about)} (Report ${ctx.reportN[l.key]})`],
        ['Sent to', keepNames(esc(contactLabel(l.student, l.to)))],
        ['Sent', `${esc(DAY_SHORT)} at ${esc(l.time)} by email and text`],
        ['Reviewed and sent by', keepNames(esc(STAFF.vt))],
        ['Delivery', `Email delivered ${esc(l.time)} · Text delivered ${esc(l.time)}`],
    ])}
  <div class="email" role="group" aria-label="Email as sent">
    <div class="headers">
      <p><strong>Subject:</strong> ${esc(l.subject)}</p>
      <p><strong>From:</strong> Cajon Valley EDP</p>
    </div>
    ${l.body.map(p => `<p>${keepNames(esc(p))}</p>`).join('\n    ')}
  </div>
</section>`;
};

// ── Shared page style (CDE PDF Standards: Arial 12 pt, black on white, simple tables) ──
const style = footer => `<style>
  @page {
    size: Letter;
    margin: 0.6in 0.6in 0.75in;
    @bottom-left { content: ${cssString(footer)}; font: 12pt Arial, Helvetica, sans-serif; color: #000; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 12pt Arial, Helvetica, sans-serif; color: #000; }
  }
  html { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: 12pt; color: #000; background: #fff; }
  body { margin: 0; line-height: 1.3; }
  p { margin: 0 0 6pt; }

  .masthead { border-top: 4pt solid #000; border-bottom: 1pt solid #000; padding: 12pt 0 10pt; text-align: center; margin-bottom: 12pt; }
  .masthead h1 { font-size: 21pt; margin: 0 0 6pt; line-height: 1.15; }
  .masthead h1 .kind { font-size: 15pt; }
  .masthead .sub { font-size: 13pt; font-weight: bold; letter-spacing: 0.04em; margin: 0; }
  .masthead .tag { font-size: 12pt; letter-spacing: 0.06em; margin: 2pt 0 0; }

  h2 { font-size: 15pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1pt solid #000; break-after: avoid; }
  h3 { font-size: 13pt; margin: 12pt 0 6pt; break-after: avoid; }
  h4 { font-size: 12pt; margin: 10pt 0 4pt; break-after: avoid; }
  .page-break { break-before: page; }
  .intro { break-after: avoid; }
  @page wide { size: Letter landscape; margin: 0.5in 0.45in 0.7in; }
  .wide { page: wide; }

  .box { border: 1.25pt solid #000; padding: 9pt 14pt 7pt; margin: 8pt 0 10pt; }
  .box.dashed p { margin: 0 0 2pt; }
  .box.keep { break-inside: avoid; }
  .box.dashed { border-style: dashed; }
  .box > h3:first-child, .box > h2:first-child { margin-top: 0; padding-bottom: 4pt; border-bottom: 0.75pt solid #000; }
  .box > h2:first-child { font-size: 13pt; }

  .fields { margin: 6pt 0; }
  .fields > div { display: grid; grid-template-columns: 1.75in 1fr; gap: 8pt; padding: 1.5pt 0; break-inside: avoid; }
  .fields dt { font-weight: bold; }
  .fields dd { margin: 0; }

  table { width: 100%; border-collapse: collapse; margin: 4pt 0 12pt; }
  caption { caption-side: top; text-align: left; font-weight: bold; padding-bottom: 4pt; break-after: avoid; }
  thead, tbody tr:first-child { break-after: avoid; }
  th, td { border: 0.75pt solid #000; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  thead { display: table-header-group; }
  thead th { border-bottom: 2pt solid #000; }
  tr { break-inside: avoid; }
  table.keep { break-inside: avoid; }
  .box table { margin-bottom: 8pt; }
  td.num, th.num { text-align: right; }
  .log .c-time { width: 0.8in; } .log .c-student { width: 1.65in; } .log .c-grade { width: 0.6in; } .log .c-prog { width: 1.2in; }
  .log .c-staff { width: 1.45in; } .log .c-loc { width: 1.85in; }
  .log.one .c-loc { width: 1.9in; }
  .sheet .c-student { width: 1.6in; } .sheet .c-id { width: 0.95in; } .sheet .c-grade { width: 0.6in; } .sheet .c-prog { width: 1.2in; } .sheet .c-time { width: 0.95in; }
  .glance, .texts, .facts, .checks { table-layout: fixed; }
  .checks .c-check { width: 1.05in; } .checks .c-time { width: 0.85in; } .checks .c-staff { width: 1.5in; }
  .glance .c-session { width: 1.45in; }
  .plain { font-weight: normal; } .glance .c-total { width: 1.35in; }
  .facts .c-id { width: 1.05in; } .facts .c-grade { width: 0.7in; } .facts .c-prog { width: 1.25in; } .facts .c-date { width: 2.3in; }
  .texts .c-time { width: 0.8in; } .texts .c-to { width: 1.95in; } .texts .c-status { width: 0.95in; }
  .log, .sheet, .texts { line-height: 1.3; }
  .log th, .log td, .sheet th, .sheet td, .texts th, .texts td { padding: 3pt 6pt; }
  .name, .action { font-weight: bold; }
  .nw { white-space: nowrap; }

  ul.plain { margin: 4pt 0 6pt; padding-left: 18pt; }
  ul.plain li { margin: 2pt 0; }

  blockquote { margin: 6pt 0 8pt; padding: 2pt 0 2pt 12pt; border-left: 3pt solid #000; }

  .email { border: 0.75pt solid #000; padding: 10pt 12pt; margin: 8pt 0 4pt; }
  .email .headers { border-bottom: 0.75pt solid #000; padding-bottom: 6pt; margin-bottom: 8pt; }
  .email .headers p { margin: 0 0 2pt; }

  .sign { display: grid; grid-template-columns: 1fr 1fr 0.8fr; gap: 18pt; margin-top: 14pt; }
  .sign div { border-top: 0.75pt solid #000; padding-top: 3pt; }
</style>`;

const page = ({ title, description, footer, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${style(footer)}
</head>
<body>
${body}
</body>
</html>
`;

const leadReview = `
<section class="box dashed keep" aria-labelledby="review">
  <h2 id="review">Lead Review for Printed Copies</h2>
  <div class="sign"><div>Reviewed by (print name)</div><div>Signature</div><div>Date</div></div>
</section>`;

const SITE_FILE = `edp-daily-${DAY_ISO}.pdf`;
const SITE_PATH = [DRIVE_ROOT, SCHOOL_YEAR, 'Daily Reports', SITE_FILE];
const studentPath = k => [DRIVE_ROOT, SCHOOL_YEAR, `Grade ${S[k].grade}`, S[k].name, `edp-${DAY_ISO}-${S[k].id}.pdf`];
const drivePath = parts => parts.map(esc).join(' / ');

// ── Site Daily Report: every student, one day ──────────────────────────────
const siteReport = () => {
    const reports = [...REPORTS].sort((a, b) => rosterOrder(a.student, b.student));
    const letters = [...LETTERS].sort((a, b) => rosterOrder(a.student, b.student));
    const ctx = newContext(reports.map(r => r.key));
    const count = (session, pred) => EVENTS.filter(e => (!session || e.session === session) && pred(e)).length;
    const uniq = (session, pred) => new Set(EVENTS.filter(e => (!session || e.session === session) && pred(e)).map(e => e.student)).size;
    const attended = session => new Set(Object.keys(S).filter(k => sessionDay(k, session).checkIn));
    const sunriseIn = attended('sunrise'), sunsetIn = attended('sunset');
    const dayIn = new Set([...sunriseIn, ...sunsetIn]);
    const sheetCell = (d, side) => (side === 'in' ? d.checkIn?.time ?? 'Absent' : d.checkOut?.time ?? 'N/A');
    const fingerprint = fingerprintOf(EVENTS);

    const body = `
<header class="masthead">
  <h1><span class="kind">EDP Daily Report:&nbsp;</span><br>${esc(SITE)}, ${esc(DAY_SHORT)}</h1>
  <p class="sub">${esc(DISTRICT)} · Extended Day Program</p>
  <p class="tag">Locked Attendance and Incident Record</p>
</header>

<section class="box dashed keep" aria-label="Sample record">
  <p><strong>Sample record, demonstration data only.</strong> Every name, time, location and message is made up. Delivery confirmations, locations and early release reason codes show features that are not connected yet.</p>
</section>

<section class="box keep" aria-labelledby="details">
  <h2 id="details">Record Details</h2>
  ${fields([
        ['Site', `${esc(SITE)}<br>${esc(SITE_ADDR)}<br>${esc(SITE_GEO)}. "On site" means within 100 m of this point.`],
        ['Date', `${esc(DAY)} (Pacific Time)`],
        ['Sessions', Object.values(SESSIONS).map(s => `${s.label} (${s.when}): ${s.hours}`).join('<br>')],
        ['Programs', 'ASES and ELO-P'],
        ['Staff on duty', [STAFF.vt, STAFF.do, STAFF.cm].map(staffWithRole).join('<br>')],
        ['Early release policy', `Leaving Sunset before ${EARLY_RELEASE_BEFORE} needs a reason code (sample site policy).`],
        ['Record status', `Locked. ${EVENTS.length} entries. Entries are never edited or deleted; corrections appear as new entries.`],
        ['Record ID', `${SITE_ID}-${DAY_ISO}`],
        ['Prepared', `${esc(DAY_SHORT)}, 6:15 PM, by the EDP Attendance app for ${esc(DISTRICT)}`],
        ['Saved to', `Google Drive (district account): ${drivePath(SITE_PATH)}`],
        ['Student reports', `Each student who attended also has a Student Daily Report for this day, in ${esc(DRIVE_ROOT)} / ${SCHOOL_YEAR} / Grade / Student name.`],
    ])}
</section>

<h2>Day at a Glance</h2>
<table>
  ${caption(ctx, `Totals for ${DAY_SHORT}`)}
  <thead><tr><th scope="col">Measure</th><th scope="col" class="num">Sunrise</th><th scope="col" class="num">Sunset</th><th scope="col" class="num">Whole Day</th></tr></thead>
  <tbody>
    <tr><td>Students checked in</td><td class="num">${sunriseIn.size}</td><td class="num">${sunsetIn.size}</td><td class="num">${dayIn.size} (different students)</td></tr>
    <tr><td>Students checked out</td><td class="num">${uniq('sunrise', isOut)}</td><td class="num">${uniq('sunset', isOut)}</td><td class="num">${uniq(null, isOut)} (different students)</td></tr>
    <tr><td>Still checked in at closing</td><td class="num">0</td><td class="num">0</td><td class="num">0</td></tr>
    <tr><td>Early releases</td><td class="num">N/A</td><td class="num">${count('sunset', e => e.reason)}</td><td class="num">${count(null, e => e.reason)}</td></tr>
    <tr><td>Check-ins undone (corrections)</td><td class="num">${count('sunrise', undone)}</td><td class="num">${count('sunset', undone)}</td><td class="num">${count(null, undone)}</td></tr>
    <tr><td>Green Card behavior tickets</td><td class="num">0</td><td class="num">1</td><td class="num">1</td></tr>
    <tr><td>We Care reports</td><td class="num">0</td><td class="num">1</td><td class="num">1</td></tr>
    <tr><td>Head injury reports</td><td class="num">0</td><td class="num">1</td><td class="num">1</td></tr>
    <tr><td>Parent letters sent</td><td class="num">0</td><td class="num">${LETTERS.length}</td><td class="num">${LETTERS.length}</td></tr>
    <tr><td>Pickup contacts approved</td><td class="num">0</td><td class="num">${count('sunset', e => e.action === 'Pickup contact approved')}</td><td class="num">${count(null, e => e.action === 'Pickup contact approved')}</td></tr>
  </tbody>
</table>

<h2>Incident Reports</h2>
${reports.map(r => reportBox(ctx, r)).join('\n')}

<h2>Parent Communication</h2>
<p>Each letter appears exactly as it was sent, after Lead review. Routine texts (arrival and pickup) are listed in each student's daily report.</p>
${letters.map(l => letterBox(ctx, l)).join('\n')}

<h2>Pickup Contacts and Corrections</h2>
<table>
  ${caption(ctx, 'Pickup contact approvals')}
  <thead><tr><th scope="col">Time</th><th scope="col">Student</th><th scope="col">Contact</th><th scope="col">Approved By</th><th scope="col">Recorded By</th></tr></thead>
  <tbody>
    <tr><td>4:12 PM</td><td>${studentCell('sofia')}</td>${keepNames(`<td>Elena Yako (Grandmother), Contact 2</td><td>Maria Yako (Mother, Contact 1), by phone</td><td>${esc(STAFF.vt)}</td>`)}</tr>
  </tbody>
</table>
<table>
  ${caption(ctx, 'Check-ins undone')}
  <thead><tr><th scope="col">Time</th><th scope="col">Student</th><th scope="col">What Was Corrected</th><th scope="col">Undone By</th><th scope="col">Family Notified</th></tr></thead>
  <tbody>
    <tr><td>7:32 AM</td><td>${studentCell('omarK')}</td>${keepNames(`<td>The 7:31 AM Sunrise check-in (wrong student selected). Omar Hannosh was checked in at 7:32 AM.</td><td>${esc(STAFF.vt)}</td><td>Yes. Correction text to Huda Khan (Mother) at 7:32 AM.</td>`)}</tr>
  </tbody>
</table>

<h2>Terms Used in This Report</h2>
${fields([
        ['ASES', `${PROGRAM_NAMES.ASES} (state-funded).`],
        ['ELO-P', `${PROGRAM_NAMES['ELO-P']} (state-funded).`],
        ['Sunrise', SESSIONS.sunrise.what],
        ['Sunset', SESSIONS.sunset.what],
        TERMS.batch,
        TERMS.group,
        TERMS.location,
        TERMS.early,
        TERMS.correction,
    ])}

<section class="box keep" aria-labelledby="integrity">
  <h2 id="integrity">Record Integrity</h2>
  <p>This report is generated from the EDP Attendance event log, which is append-only: no entry can be edited or deleted, and each entry stores who recorded it, on which device, and when. Changes appear only as new entries, such as the correction in Table ${ctx.table}.</p>
  ${fields([
        ['Entries', String(EVENTS.length)],
        ['Fingerprint', `<span style="word-break: break-all">SHA-256 ${fingerprint}</span>`],
        ['How to verify', 'Export the same day again from the app. An identical fingerprint means no entry has changed since this report was saved.'],
    ])}
</section>
${leadReview}

<section class="wide">
<h2>Attendance Sheet</h2>
<p>One row per student, by grade (TK, K, then 1 to 5) and then by first name, the same order as the app's roster. This replaces the paper sign-in and sign-out sheet.</p>
<table class="sheet">
  ${caption(ctx, 'Sign-in and sign-out times by student')}
  <colgroup><col class="c-grade"><col class="c-student"><col class="c-id"><col class="c-prog"><col class="c-time"><col class="c-time"><col class="c-time"><col class="c-time"><col></colgroup>
  <thead><tr><th scope="col">Grade</th><th scope="col">Student</th><th scope="col">Student ID</th><th scope="col">Program</th><th scope="col">Sunrise In</th><th scope="col">Sunrise Out</th><th scope="col">Sunset In</th><th scope="col">Sunset Out</th><th scope="col">Released To (Sunset)</th></tr></thead>
  <tbody>
${byRoster(Object.keys(S)).map(k => {
        const rise = sessionDay(k, 'sunrise'), set = sessionDay(k, 'sunset');
        const released = set.releasedTo ? `${set.releasedTo}${set.checkOut.reason ? `. Early release, reason ${set.checkOut.reason}.` : ''}` : 'N/A';
        return `    <tr><td>${esc(S[k].grade)}</td><td>${nameCell(k)}</td><td>${esc(S[k].id)}</td><td class="nw">${esc(S[k].program)}</td><td>${sheetCell(rise, 'in')}</td><td>${sheetCell(rise, 'out')}</td><td>${sheetCell(set, 'in')}</td><td>${sheetCell(set, 'out')}</td><td>${keepNames(esc(released))}</td></tr>`;
    }).join('\n')}
  </tbody>
</table>

<h2 class="page-break">Activity Log</h2>
<p class="intro">The complete record: every action, in the order it happened, so this log stays in time order. Students checked in or out together are listed by grade, then first name. Each row is a permanent entry; an undone check-in appears as its own row rather than erasing the first.</p>
<h3>Sunrise Session (${SESSIONS.sunrise.hours})</h3>
${logTable(ctx, EVENTS.filter(e => e.session === 'sunrise'), 'Sunrise activity')}
<h3 class="page-break">Sunset Session (${SESSIONS.sunset.hours})</h3>
${logTable(ctx, EVENTS.filter(e => e.session === 'sunset'), 'Sunset activity')}
</section>
`;
    const description = `Locked daily attendance and incident record for the Extended Day Program (EDP) at ${SITE} on ${DAY_SHORT}: check-ins, check-outs, Green Card, We Care and head injury reports, and parent letters. Sample data.`;
    return {
        description,
        html: page({ title: `EDP Daily Report - ${SITE} - ${DAY_SHORT}`, description, footer: `EDP Daily Report · ${SITE} · ${DAY_SHORT}`, body }),
    };
};

// ── Student Daily Report: one student, one day ─────────────────────────────
const studentReport = k => {
    const s = S[k];
    const events = eventsOf(k);
    const reports = REPORTS.filter(r => r.student === k);
    const letters = LETTERS.filter(l => l.student === k);
    const texts = textsFor(k);
    const ctx = newContext(reports.map(r => r.key), true);
    const days = { sunrise: sessionDay(k, 'sunrise'), sunset: sessionDay(k, 'sunset') };
    const undos = [...days.sunrise.undos, ...days.sunset.undos];
    const early = days.sunset.checkOut?.reason;
    const added = events.find(e => e.action === 'Pickup contact added');
    const approved = events.find(e => e.action === 'Pickup contact approved');
    const staffInvolved = [...new Set(events.map(e => e.staff))];
    const grade = `Grade ${s.grade}`;
    const fingerprint = fingerprintOf(events);
    const has = pred => events.some(pred);

    const attendanceRow = session => {
        const d = days[session];
        const { label: name, when, short } = SESSIONS[session];
        const label = `<th scope="row">${name}<br><span class="plain">${when[0].toUpperCase()}${when.slice(1)}<br>${short}</span></th>`;
        if (!d.checkIn) {
            const note = d.undos.length
                ? `Absent. The ${d.undos[0].original.time} check-in was undone at ${d.undos[0].undo.time} (correction).`
                : 'Absent';
            return `<tr>${label}<td>${note}</td><td>N/A</td><td>None</td></tr>`;
        }
        const inCell = `${d.checkIn.time}<br>By ${keepNames(esc(d.checkIn.staff))}${d.checkIn.group ? `<br>Group ${d.checkIn.group}` : ''}`;
        const outCell = !d.checkOut
            ? 'Not checked out'
            : d.checkOut.location.kind === 'N/A'
                ? `${d.checkOut.time}<br>To the school day (batch)`
                : `${d.checkOut.time}<br>To ${keepNames(esc(d.releasedTo))}${early && session === 'sunset' ? ', early release' : ''}`;
        return `<tr>${label}<td>${inCell}</td><td>${outCell}</td><td>${duration(d.minutes)}</td></tr>`;
    };

    const terms = [
        ...s.program.split(', ').map(p => [p, `${PROGRAM_NAMES[p]} (state-funded).`]),
        has(e => e.location.kind === 'N/A') && TERMS.batch,
        has(e => e.group) && TERMS.group,
        TERMS.location,
        early && TERMS.early,
        undos.length && TERMS.correction,
    ].filter(Boolean);

    const body = `
<header class="masthead">
  <h1><span class="kind">EDP Student Daily Report:&nbsp;</span><br>${esc(s.name)}, ${esc(DAY_SHORT)}</h1>
  <p class="sub">${esc(SITE)} · Extended Day Program</p>
  <p class="tag">${esc(DISTRICT)} · Locked Attendance and Incident Record</p>
</header>

<section class="box dashed keep" aria-label="Sample record">
  <p><strong>Sample record, demonstration data only.</strong> Every name, time, location and message is made up. Delivery confirmations, locations and early release reason codes show features that are not connected yet.</p>
</section>

<section class="box keep" aria-labelledby="details">
  <h2 id="details">Student Details</h2>
  <table class="facts keep" aria-labelledby="details">
    <colgroup><col><col class="c-id"><col class="c-grade"><col class="c-prog"><col class="c-date"></colgroup>
    <thead><tr><th scope="col">Student</th><th scope="col">Student ID</th><th scope="col">Grade</th><th scope="col">Program</th><th scope="col">Date</th></tr></thead>
    <tbody><tr><td><span class="name nw">${esc(s.name)}</span></td><td>${esc(s.id)}</td><td>${esc(s.grade)}</td><td>${esc(s.program)}</td><td class="nw">${esc(DAY)}</td></tr></tbody>
  </table>
  ${fields([
        ['School', `${esc(SITE)}, ${esc(SITE_ADDR)}`],
        ['Pickup contacts', [
            `Contact 1: ${keepNames(esc(s.c1))}`,
            s.c2 && `Contact 2: ${keepNames(esc(s.c2))}${approved ? `, approved today at ${approved.time} by ${keepNames(esc(personName(s.c1)))}` : ''}`,
        ].filter(Boolean).join('<br>')],
        ['Staff involved', staffInvolved.map(staffWithRole).join('<br>')],
    ])}
</section>

<h2>Day at a Glance</h2>
<table class="glance keep">
  ${caption(ctx, `Attendance for ${s.name}, ${DAY_SHORT} (Pacific Time)`)}
  <colgroup><col class="c-session"><col><col><col class="c-total"></colgroup>
  <thead><tr><th scope="col">Session</th><th scope="col">Checked In</th><th scope="col">Checked Out</th><th scope="col">Time Attended</th></tr></thead>
  <tbody>
    ${attendanceRow('sunrise')}
    ${attendanceRow('sunset')}
  </tbody>
</table>
${fields([
        ['Total time', duration(days.sunrise.minutes + days.sunset.minutes)],
        ['Early release', early
            ? `Yes. Checked out at ${days.sunset.checkOut.time}, before the site's ${EARLY_RELEASE_BEFORE} early release time. Reason ${early}: ${EARLY_REASONS[early]}.`
            : `No. Leaving Sunset before ${EARLY_RELEASE_BEFORE} is an early release (sample site policy).`],
        ['Incident reports', reports.length
            ? reports.map(r => `Report ${ctx.reportN[r.key]}: ${esc(r.short)}, ${reportEvent(r.key).time}`).join('<br>')
            : 'None'],
        ['Messages sent', `${letters.length ? plural(letters.length, 'letter') : 'No letters'} · ${plural(texts.length, 'text message')}`],
        ['Corrections', undos.length
            ? undos.map(u => `${SESSIONS[u.undo.session].label} check-in at ${u.original.time} undone at ${u.undo.time} by ${keepNames(esc(u.undo.staff))}. ${esc(u.undo.detail)}`).join('<br>')
            : 'None'],
        ...(added ? [['Pickup contacts', `${keepNames(esc(personName(s.c2)))} added as Contact 2 at ${added.time} and approved by ${keepNames(esc(personName(s.c1)))} at ${approved.time}.`]] : []),
    ])}

<h2>Incident Reports</h2>
${reports.length
        ? reports.map(r => reportBox(ctx, r)).join('\n')
        : `<p>None. No Green Card, We Care or head injury report was filed for ${esc(s.name)} on this day.</p>`}

<h2>Parent Communication</h2>
<p class="intro">Every message sent to the family on this day, exactly as it was sent.</p>
${letters.length
        ? letters.map(l => letterBox(ctx, l)).join('\n')
        : '<p>No letters were sent on this day.</p>'}
<table class="texts">
  ${caption(ctx, 'Text messages to the family')}
  <colgroup><col class="c-time"><col class="c-to"><col><col class="c-status"></colgroup>
  <thead><tr><th scope="col">Time</th><th scope="col">Sent To</th><th scope="col">Message</th><th scope="col">Status</th></tr></thead>
  <tbody>
${texts.map(t => `    <tr><td class="nw">${esc(t.time)}</td><td>${keepNames(esc(t.to))}</td><td>${keepNames(esc(t.msg))}</td><td>Delivered</td></tr>`).join('\n')}
  </tbody>
</table>

<h2>Activity Log</h2>
<p class="intro">Every entry for ${esc(s.name)} on this day, in the order it happened. Each row is a permanent entry; an undone check-in appears as its own row rather than erasing the first.</p>
${logTable(ctx, events, `Every entry for ${s.name}, ${DAY_SHORT}`, true)}

<h2>Terms Used in This Report</h2>
${fields(terms)}

<section class="box keep" aria-labelledby="integrity">
  <h2 id="integrity">Record Integrity</h2>
  <p>Built from the EDP Attendance event log, which is append-only: entries are never edited or deleted, and each one records who made it, on which device, and when.</p>
  ${fields([
        ['Record status', `Locked. ${plural(events.length, 'entry', 'entries')}. Prepared ${esc(DAY_SHORT)}, 6:15 PM.`],
        ['Record ID', `${SITE_ID}-${DAY_ISO}-${esc(s.id)}`],
        ['Fingerprint', `<span style="word-break: break-all">SHA-256 ${fingerprint}</span>`],
        ['How to verify', 'Export this student and day again from the app. A matching fingerprint means nothing has changed.'],
        ['Saved to', `Google Drive (district account): ${drivePath(studentPath(k))}`],
        ['Also in', `The site's Daily Report: ${drivePath(SITE_PATH)}`],
    ])}
</section>
`;
    const description = `Locked Extended Day Program (EDP) record for ${s.name}, ${grade}, ${s.program}, at ${SITE} on ${DAY_SHORT}: attendance, incident reports and messages to the family. Sample data.`;
    return {
        description,
        html: page({ title: `EDP Student Daily Report - ${s.name} - ${grade} - ${DAY_SHORT}`, description, footer: `${s.name} · ${grade} · ${DAY_SHORT}`, body }),
    };
};

// ── Print ───────────────────────────────────────────────────────────────────
// Chrome can't fill in the PDF's Subject (Acrobat's "Description"), which the CDE PDF Standards
// ask for. It goes in as an incremental update: new bytes appended after Chrome's, so the
// accessibility tags Chrome wrote are left exactly as they were.
const pdfString = t => (/^[\x20-\x7e]*$/.test(t)
    ? `(${t.replace(/[\\()]/g, c => `\\${c}`)})`
    : `<FEFF${Buffer.from(t, 'utf16le').swap16().toString('hex').toUpperCase()}>`);
const addSubject = (file, subject) => {
    const pdf = readFileSync(file);
    const text = pdf.toString('latin1');
    const trailer = text.slice(text.lastIndexOf('trailer'));
    const info = trailer.match(/\/Info (\d+) 0 R/)[1];
    const root = trailer.match(/\/Root (\d+ \d+ R)/)[1];
    const size = trailer.match(/\/Size (\d+)/)[1];
    const prev = text.match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1];
    const dict = text.match(new RegExp(`\\n${info} 0 obj\\s*<<([\\s\\S]*?)>>\\s*endobj`))[1];
    const obj = `${info} 0 obj\n<<${dict}\n/Subject ${pdfString(subject)}>>\nendobj\n`;
    const objAt = pdf.length + 1;
    const xrefAt = objAt + Buffer.byteLength(obj, 'latin1');
    const update = `\n${obj}xref\n${info} 1\n${String(objAt).padStart(10, '0')} 00000 n \ntrailer\n<</Size ${size}\n/Root ${root}\n/Info ${info} 0 R\n/Prev ${prev}>>\nstartxref\n${xrefAt}\n%%EOF\n`;
    writeFileSync(file, Buffer.concat([pdf, Buffer.from(update, 'latin1')]));
};

const work = mkdtempSync(join(tmpdir(), 'edp-records-'));
const print = ({ html, description }, parts) => {
    const pdf = join(OUT, ...parts);
    const src = join(work, `${parts.at(-1)}.html`);
    writeFileSync(src, html);
    mkdirSync(dirname(pdf), { recursive: true });
    execFileSync(CHROME, [
        '--headless=new', `--user-data-dir=${join(work, 'profile')}`, '--no-first-run',
        '--no-pdf-header-footer', '--generate-pdf-document-outline', '--export-tagged-pdf',
        `--print-to-pdf=${pdf}`, pathToFileURL(src).href,
    ], { stdio: 'ignore' });
    addSubject(pdf, description);
    console.log(`  ${relative(OUT, pdf)}`);
};

// A student gets a report for each day they attended either session.
const attendedToday = k => sessionDay(k, 'sunrise').checkIn || sessionDay(k, 'sunset').checkIn;

console.log(`Printing to ${OUT}`);
print(siteReport(), SITE_PATH);
for (const k of Object.keys(S).filter(attendedToday)) print(studentReport(k), studentPath(k));
if (process.env.KEEP_HTML) console.log(`HTML kept in ${work}`);
else rmSync(work, { recursive: true, force: true });
