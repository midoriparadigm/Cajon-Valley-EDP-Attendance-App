<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EDP Attendance

Site-level check-in / check-out, behavior / injury / We Care reports, and parent
communication for Cajon Valley's Extended Day Program.

View your app in AI Studio: https://ai.studio/apps/drive/13BqyLoA0-bRFRHmUQ7mvu3yihpB1GC_s

## Run locally

**Prerequisites:** Node.js 20.19+ (Vite 6 requirement)

The dev server listens on this machine only. To open it from a phone on the same
network, start it with `npm run dev -- --host`.

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (optional: `VITE_GEMINI_API_KEY` for AI-drafted parent letters).
3. `npm run dev` → http://localhost:3000

With no Supabase settings the app does not try to sign in: the login screen
offers **Explore with sample data**, which runs entirely on a built-in sample
roster and saves nothing.

## Run with Docker

```bash
docker compose up --build app      # → http://localhost:8080
```

`VITE_*` values are baked into the bundle at **build** time, so export them (or
put them in a `.env` file next to `docker-compose.yml`) before building. Built
without them, the image still starts and runs in sample-data mode.

## Database

- **New project:** run `supabase/schema.sql` in the Supabase SQL editor, then
  each file in `supabase/migrations/` in name order.
- **Existing project:** run only the migrations you haven't applied. Don't
  re-run `schema.sql` — its `CREATE POLICY` statements fail on a second run.
  Each migration is idempotent.

`attendance_events` (first migration) is the permanent record behind **Leader
Dashboard → Program Log** and the history on each student page: one row per
check-in, undone check-in, pickup, check-out, behavior ticket, We Care report,
head-injury report and follow-up check, and approved parent report (with the
letter's text). It is append-only — no update or delete through the API, a
trigger blocks them even for the service role, and students with history cannot
be deleted. Inserts must carry the signed-in user's id as `recorded_by`. The
second migration (`20261026000000_report_history.sql`) adds the We Care /
follow-up-check event types, the letter text column and the staff "See All
Reports" permission. The third (`20261116000000_early_release_forms.sql`) adds
the Early Release Form tables and the two functions a guardian's link uses.

Known gaps, not yet fixed (they need further migrations):
- `recorded_at` defaults to the database clock but a client can supply its own,
  so event times are not yet tamper-proof.
- Access rules check that someone is signed in, not that they are on the
  `staff` table — any account can read the roster and write events. That
  includes parent-letter text, which the app shows to the Lead only.
- An attendance change and its event are two separate requests: the app logs an
  event only after the database confirms the change, but if the event write
  then fails, the change stands without its log entry (the app warns).

## Checking students in

- **One student:** tap the card, then **Confirm** (the arrow button next to it
  cancels; so does Esc). A quick double-tap doesn't count as Confirm. The
  guardian's arrival text goes out once the database confirms the check-in.
- **A group:** tap **Select group**, tap each student (or **Select all shown**
  after filtering by grade), then **Check in N** and confirm in the pop-out,
  which lists everyone selected. Everyone gets the same timestamp.
- **Undo:** a check-in is final for staff. A Lead sees an **Undo** button on a
  checked-in student's card and confirms before it is reverted. The arrival text
  can't be recalled, so the primary contact gets a short correction text; both
  the check-in and the undo stay in the Program Log.
- The database has the last word: a check-in only applies to students it
  confirms are still absent and not blocked, so two devices can't both check in
  the same child. Anyone it refuses — or everyone, if it can't be reached — is
  rolled back on screen with a warning. Nothing is logged, and no text is sent,
  for a refused check-in.
- **Check-out:** for students in the database, the staff member's confirmation
  of who is picking up completes the check-out and records who they were
  released to. The guardian-text confirmation is only simulated, for sample data.
- **Parent letter at pickup:** tapping **CHECK-OUT** for a student with a parent
  letter that is still a draft, or was sent today, shows a toast (and the same
  note in the check-out panel) with **Open letter**. It opens Leader Dashboard →
  Parent Reports on that student's letter, so the Lead can talk with the family
  face to face, then generate and send the letter by email and/or text. **Back to
  check-out** returns to the check-out, still waiting to be confirmed.
- **Logout** removes the session and all loaded student data from the device,
  even if Supabase can't be reached at that moment.
- Students added or imported in the app are **not saved to the database yet**;
  they last for the session and are marked "not saved" in the Program Log.

## Student page and Program Log

- **Student page:** a summary card above the tiles lists what happened today —
  attendance, Green Card, We Care and head-injury reports — each with its tile's
  icon; tapping a line opens that tile, and each tile shows its status. Staff see
  attendance plus the reports they filed themselves; **Staff Permissions → See
  All Reports** lets the Lead show them everyone's. The same rule applies to the
  Green Card, We Care and Head Injury tiles: someone else's report opens to a
  locked notice (for a head injury still being checked, it also says when the
  next check is due). Parent letters (awaiting
  review / sent, with the letter text) and pending pickup approvals are
  Lead-only, as is the date picker for earlier days. The Lead's **Print**
  button on the card prints that student's **Student Daily Report** for the day
  shown.
- **Program Log** (Leader Dashboard): the whole program's day in order, with
  totals (checked in / out / still here, incidents, letters sent), grade and type
  filters, and CSV export.
- **Needs attention:** the Program Log lists what is not finished — a check-in
  with no check-out, a pickup that was never confirmed, head injury checks not
  done. Items are flagged once their session closes (Sunrise 8:00 AM, Sunset
  6:00 PM; head injury checks 35 minutes after the report starts) or for any
  earlier day, and the Program Log tile on the Leader Dashboard shows how many
  are flagged today, so they can be fixed the same day. The closing times are
  fixed in `src/utils/dailyRecord.ts` for now; they are not yet a site setting.
- **Print daily report** (Program Log) prints the **Daily Report** for the day
  and grade shown, laid out like the samples in `docs/samples` (CDE PDF
  Standards: Arial 12 pt, Title Case headings, simple tables with repeating
  header rows): record details, needs attention, totals, the attendance sheet
  (replacing the paper sign-in and sign-out sheet), incident reports, parent
  letters as sent, the full activity log, a fingerprint of the entries and
  signature lines for a Lead's review. "Save as PDF" in the print dialog keeps a
  copy. The reports are not yet saved to Google Drive automatically.
- In sample-data mode, earlier weekdays are filled with made-up, repeatable
  history (labelled "Sample data") so these views can be demonstrated.
- Staff Permissions changes are kept for the session only; they are not saved
  to the `staff` table yet.

## Early Release Forms

The electronic version of the district's paper *Elementary School Early Release
Form* (Rev. 02/05/2026), under **Leader Dashboard → Early Release Forms**:

1. **Send.** Set the school, program cycle and program hours once, pick students
   (or **Select all without a form**) and send. Contact 1 gets a single-use link
   by text, or by email if there is no phone number.
2. **Parent signs on their phone.** The link opens the form itself — no account,
   no login — in English or Spanish. The parent says whether their child needs
   early release, adds each date range (reason 1–8 and a release time per
   weekday), ticks the box agreeing to sign electronically, and types or draws
   their signature. One sitting signs every date range and the agreement.
3. **A Lead countersigns** in the app, which approves and locks the form.
4. **Cityspan.** Each signed date range waits on the list until someone marks it
   as entered into Cityspan (who and when is recorded). **To enter** / **All
   signed** export the same list as CSV, so nothing is retyped from paper.
5. **Print.** Every form has a **Print** button. It prints the district's paper
   form filled in (date ranges, the parent's signature and the program leader's
   initials, the agreement signed by both, the "For Site Use Only" Cityspan
   line) on one page, followed by a **Signature Record** page: who signed, how
   (texted or emailed link, in the app, on paper) and when, with every step in
   order. **Print signed** on the list prints every signed form for the cycle
   (or the grade shown) behind a cover page, in roster order. A form that is
   not signed by both, or was replaced, prints with a box saying it is not an
   approved form. "Save as PDF" in the print dialog keeps a copy.

Every step is time stamped automatically and listed under **Record** on the
form. Nothing is edited afterwards: a new link lets the family add a date range
or change one (the old one stays, marked as replaced), and a corrected form
replaces the old one without removing it. A form signed on paper can be recorded
so the list is complete. Each student page has an **Early Release Form** tile;
when a signed date range covers today, the page shows the approved release time
to everyone, and a Sunset check-out is logged with the reason.

Where forms are kept:

- **Students in the database, after the third migration is applied:** in
  Supabase. The tables are append-only, every time is the database clock, and a
  guardian can reach a form only through two functions that take the token from
  their link (only a hash of the token is stored). A link works once, expires
  after 14 days, and stops working when a newer one is sent.
- **Sample data, students added this session, or before the migration:** on the
  staff device only, until logout — the screen says so. The parent's side is
  then opened from the form (**Open the parent's view**).

Not done yet:

- Texts and emails are simulated, so the link is not actually delivered. For a
  demo, open the parent's view from the form, or copy the link to a phone.
- Entering into Cityspan is still by hand (or from the CSV). Sending form data
  straight to Cityspan needs SDCOE's go-ahead and an import path.
- The Spanish wording is a working translation, and the consent sentence is
  ours; the district should review both. Two lines of the paper form say "ASES
  Summer program" on a school-year form and are reproduced as printed.
- Release times are not checked against the program hours.

## Pilot configuration

| Variable | Default | Notes |
|---|---|---|
| `VITE_ENABLE_STUDENT_PHOTOS` | off | Camera capture, the simulated face-verification step, avatars and Photo Review. Leave off for the SDCOE pilot ("No student photos. No facial recognition."). |

SMS (arrival / correction / pickup texts, and Early Release Form links by text or email) is simulated in this build — no messages are sent.
The Program Log says so on every pickup entry.
