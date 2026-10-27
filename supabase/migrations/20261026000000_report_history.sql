-- ============================================================================
-- Migration 2026-10-26: report history on the event ledger + "See All Reports"
-- Apply AFTER 20261022000000_live_state_and_event_ledger.sql. Idempotent —
-- safe to re-run. Adds only; changes no existing row.
--
-- The app works before this is applied, except that We Care, head-injury
-- check and parent-letter events fail to save for database students (the
-- Program Log shows them as "failed to save").
-- ============================================================================

-- ── Two more event types ─────────────────────────────────────────────────────
-- So a student's past days can show We Care reports and head-injury follow-up
-- checks. Until now only behavior tickets and the start of a head-injury
-- report were logged, and We Care reports were not saved anywhere.
ALTER TABLE public.attendance_events DROP CONSTRAINT IF EXISTS attendance_events_event_type_check;
ALTER TABLE public.attendance_events ADD CONSTRAINT attendance_events_event_type_check CHECK (
  event_type IN (
    'check_in',
    'check_in_undone',
    'checkout_requested',
    'checked_out',
    'behavior_submitted',
    'we_care_submitted',
    'head_injury_started',
    'head_injury_check',
    'parent_report_sent'
  )
);

-- ── Text of sent parent letters ──────────────────────────────────────────────
-- Set on parent_report_sent rows only: the letter as it was sent, so the Lead
-- can read past letters from the student page and the Program Log. Like every
-- column in this table it can never be edited afterwards (append-only trigger).
-- KNOWN GAP: the app shows letters to the Lead only, but the read policy lets
-- any signed-in user read every row. Lead-only reads need a staff-role check
-- in RLS (part of the staff-only access work still to do before real data).
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS body text;

-- ── Staff Permissions → "See All Reports" ────────────────────────────────────
-- Lets a staff member see summaries of reports filed by other staff. Everyone
-- always sees the reports they filed themselves. Read by mapDbToStaff.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS can_view_all_reports boolean NOT NULL DEFAULT false;
