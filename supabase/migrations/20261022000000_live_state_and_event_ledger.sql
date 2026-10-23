-- ============================================================================
-- Migration 2026-10-22: live roster state + append-only event ledger
-- Apply AFTER supabase/schema.sql. Idempotent — safe to re-run.
-- (Production was brought up to date on 2026-10-22; nothing to do there.)
-- ============================================================================

-- ── Live roster state on students ────────────────────────────────────────────
-- The roster board reads and writes today's status directly on the student row
-- (src/App.tsx, mapDbToStudent in src/supabaseClient.ts). These columns were
-- written by the app but missing from this file, so against this schema every
-- check-in/out update was rejected. This is CURRENT state only; the permanent
-- record is public.attendance_events below.
-- Times are display strings ("3:02 PM") because that is what the board shows;
-- authoritative timestamps live in attendance_events.
-- sunrise_date / sunset_date mark which day each program's status belongs to.
-- The app shows a program as absent unless its date is today, so statuses never
-- carry over overnight — and a sunset check-in cannot revive yesterday's sunrise.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS sunrise_date date,
  ADD COLUMN IF NOT EXISTS sunset_date date,
  ADD COLUMN IF NOT EXISTS sunrise_status text NOT NULL DEFAULT 'absent'
    CHECK (sunrise_status IN ('absent', 'present', 'checked_out', 'pending_parent')),
  ADD COLUMN IF NOT EXISTS sunset_status text NOT NULL DEFAULT 'absent'
    CHECK (sunset_status IN ('absent', 'present', 'checked_out', 'pending_parent')),
  ADD COLUMN IF NOT EXISTS sunrise_checkin_time text,
  ADD COLUMN IF NOT EXISTS sunset_checkin_time text,
  ADD COLUMN IF NOT EXISTS sunrise_checkout_time text,
  ADD COLUMN IF NOT EXISTS sunset_checkout_time text,
  ADD COLUMN IF NOT EXISTS sunrise_staff text,
  ADD COLUMN IF NOT EXISTS sunset_staff text,
  ADD COLUMN IF NOT EXISTS sms_sent_time text,
  ADD COLUMN IF NOT EXISTS last_checkout_by text,
  ADD COLUMN IF NOT EXISTS behavior text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS behavior_issues text [] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS behavior_timestamp text,
  ADD COLUMN IF NOT EXISTS behavior_staff text,
  ADD COLUMN IF NOT EXISTS behavior_description text,
  ADD COLUMN IF NOT EXISTS head_injury boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS head_injury_logs jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Deliberately no checkin_photo column: student images are not stored.

-- ── Event ledger (append-only) ───────────────────────────────────────────────
-- One row per action: check-in, undone check-in, pickup started, checked out,
-- behavior ticket, head-injury report, parent report approved. Rows never change:
--   • no UPDATE or DELETE policy, so RLS denies both to every app user;
--   • a trigger rejects UPDATE, DELETE and TRUNCATE even for the table owner
--     and the service role, which bypass RLS;
--   • ON DELETE RESTRICT, so deleting a student cannot cascade away history
--     (unlike daily_attendance / behavior_logs / head_injury_logs above).
-- Attribution is server-side: recorded_by defaults to auth.uid() and the INSERT
-- policy rejects any other value, so a client cannot log an event as someone
-- else. staff_name is the display label; recorded_by is the identity.
-- recorded_at DEFAULTS to the database clock and occurred_at (the device clock)
-- must fall within a day of it. KNOWN GAP: a default is not enforced — a client
-- that supplies its own recorded_at can date events arbitrarily. A follow-up
-- migration should force recorded_at := now() in a BEFORE INSERT trigger.
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  student_name text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'check_in',
      'check_in_undone',
      'checkout_requested',
      'checked_out',
      'behavior_submitted',
      'head_injury_started',
      'parent_report_sent'
    )
  ),
  program text CHECK (program IN ('sunrise', 'sunset')),
  occurred_at timestamp with time zone NOT NULL,
  staff_name text NOT NULL,
  batch_id uuid,
  -- shared by every row from one group action
  detail text,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attendance_events_occurred_at_sane CHECK (
    occurred_at <= recorded_at + interval '5 minutes'
    AND occurred_at >= recorded_at - interval '1 day'
  )
);
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events: authenticated staff can read" ON public.attendance_events;
CREATE POLICY "events: authenticated staff can read" ON public.attendance_events FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "events: staff insert as themselves" ON public.attendance_events;
CREATE POLICY "events: staff insert as themselves" ON public.attendance_events FOR
INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND recorded_by = auth.uid()
  );
-- No UPDATE or DELETE policy, by design.
CREATE OR REPLACE FUNCTION public.attendance_events_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'attendance_events is append-only: % is not allowed',
  TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS attendance_events_no_update_delete ON public.attendance_events;
CREATE TRIGGER attendance_events_no_update_delete BEFORE
UPDATE
  OR DELETE ON public.attendance_events FOR EACH ROW EXECUTE FUNCTION public.attendance_events_reject_change();
DROP TRIGGER IF EXISTS attendance_events_no_truncate ON public.attendance_events;
CREATE TRIGGER attendance_events_no_truncate BEFORE TRUNCATE ON public.attendance_events FOR EACH STATEMENT EXECUTE FUNCTION public.attendance_events_reject_change();
CREATE INDEX IF NOT EXISTS idx_events_student_time ON public.attendance_events(student_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_time ON public.attendance_events(occurred_at);
