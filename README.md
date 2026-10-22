<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EDP Attendance

Site-level check-in / check-out, behavior / injury / We Care reports, and parent
communication for Cajon Valley's Extended Day Program.

View your app in AI Studio: https://ai.studio/apps/drive/13BqyLoA0-bRFRHmUQ7mvu3yihpB1GC_s

## Run locally

**Prerequisites:** Node.js 20.19+ (Vite 6 requirement)

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

Apply `supabase/schema.sql` in the Supabase SQL editor. The section at the end
(live roster columns + `attendance_events`) is idempotent and safe to re-run on
an existing project.

`attendance_events` is the permanent record behind **Leader Dashboard → Daily
Records**: one row per check-in, undone check-in, pickup, check-out, behavior
ticket, head-injury report and approved parent report. It is append-only — no
update or delete is possible through the API, a trigger blocks them even for
the service role, students with history cannot be deleted, and each row's
`recorded_by` is set from the signed-in user by the database.

## Checking students in

- **One student:** tap the card. An **Undo** bar stays up for 8 seconds; the
  guardian's arrival text is held until it closes, so an undone mis-tap never
  notifies a family.
- **A group:** tap **Select group**, tap each student (or **Select all shown**
  after filtering by grade), then **Check in N**. Everyone gets the same
  timestamp; blocked or already-checked-in students are skipped and reported.

## Pilot configuration

| Variable | Default | Notes |
|---|---|---|
| `VITE_ENABLE_STUDENT_PHOTOS` | off | Camera capture, the simulated face-verification step, avatars and Photo Review. Leave off for the SDCOE pilot ("No student photos. No facial recognition."). |

SMS (arrival / pickup texts) is simulated in this build — no messages are sent.
The Daily Record says so on every pickup entry.
