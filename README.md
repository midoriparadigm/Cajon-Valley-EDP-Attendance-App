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
Dashboard → Daily Records**: one row per check-in, undone check-in, pickup,
check-out, behavior ticket, head-injury report and approved parent report. It
is append-only — no update or delete through the API, a trigger blocks them even
for the service role, and students with history cannot be deleted. Inserts must
carry the signed-in user's id as `recorded_by`.

Known gaps, not yet fixed (they need further migrations):
- `recorded_at` defaults to the database clock but a client can supply its own,
  so event times are not yet tamper-proof.
- Access rules check that someone is signed in, not that they are on the
  `staff` table — any account can read the roster and write events.
- An attendance change and its event are two separate requests: the app logs an
  event only after the database confirms the change, but if the event write
  then fails, the change stands without its log entry (the app warns).

## Checking students in

- **One student:** tap the card. An **Undo** bar stays up for 8 seconds; the
  guardian's arrival text is held until it closes, so an undone mis-tap never
  notifies a family.
- **A group:** tap **Select group**, tap each student (or **Select all shown**
  after filtering by grade), then **Check in N**. Everyone gets the same
  timestamp.
- The database has the last word: a check-in only applies to students it
  confirms are still absent and not blocked, so two devices can't both check in
  the same child. Anyone it refuses — or everyone, if it can't be reached — is
  rolled back on screen with a warning. Nothing is logged for a refused check-in.
- **Check-out:** for students in the database, the staff member's confirmation
  of who is picking up completes the check-out and records who they were
  released to. The guardian-text confirmation is only simulated, for sample data.
- **Logout** removes the session and all loaded student data from the device,
  even if Supabase can't be reached at that moment.
- Students added or imported in the app are **not saved to the database yet**;
  they last for the session and are marked "not saved" in the Daily Record.

## Pilot configuration

| Variable | Default | Notes |
|---|---|---|
| `VITE_ENABLE_STUDENT_PHOTOS` | off | Camera capture, the simulated face-verification step, avatars and Photo Review. Leave off for the SDCOE pilot ("No student photos. No facial recognition."). |

SMS (arrival / pickup texts) is simulated in this build — no messages are sent.
The Daily Record says so on every pickup entry.
