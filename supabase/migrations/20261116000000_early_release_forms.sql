-- ============================================================================
-- Migration 2026-11-16: Early Release Forms, signed from a link
-- Apply AFTER 20261026000000_report_history.sql. Idempotent — safe to re-run.
-- Adds only; changes no existing table or row.
--
-- The electronic version of the district's paper "Elementary School Early
-- Release Form": staff start a form and send the guardian a single-use link;
-- the guardian adds date ranges and signs; staff countersign; staff record
-- when each date range has been entered into Cityspan.
--
-- Until this is applied the app keeps these forms on the staff device only
-- (Leader Dashboard → Early Release Forms says so) and a guardian's link can
-- only be opened from that device.
--
-- Design, in line with attendance_events:
--   • Every table is append-only. No UPDATE or DELETE policy, and a trigger
--     rejects UPDATE, DELETE and TRUNCATE even for roles that bypass RLS.
--     A changed date range is a new row that supersedes the old one; a
--     corrected form is a new form that supersedes the old one.
--   • Every timestamp is the database clock: a BEFORE INSERT trigger overwrites
--     whatever the client sent.
--   • The guardian has no account. They read and sign through two SECURITY
--     DEFINER functions that take the token from their link; the tables
--     themselves are closed to anonymous requests. Only a SHA-256 hash of the
--     token is stored, and API roles cannot select that column.
--   • A link works once (it is used as soon as a signature carries its id),
--     expires after 14 days, and stops working when a newer link is sent for
--     the same form or the form is replaced.
--
-- KNOWN GAP (the same one as the rest of the schema): staff access checks that
-- someone is signed in, not that they are on the staff table or a Lead.
-- ============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────────
-- One form per student per program cycle.
CREATE TABLE IF NOT EXISTS public.release_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  student_name text NOT NULL,   -- as printed on the form
  grade text NOT NULL,          -- as printed on the form
  site_name text NOT NULL,
  cycle text NOT NULL,          -- e.g. '2026-27 Trimester 2', 'Winter Camp 2026'
  program_hours text NOT NULL,  -- as printed, e.g. 'Mon. 1:00-6:00 pm & Tue.-Fri. 2:00 pm-6:00 pm'
  form_version text NOT NULL,   -- the wording shown, e.g. 'Rev. 02/05/2026'
  supersedes uuid REFERENCES public.release_forms(id),
  created_by_name text NOT NULL,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- A single-use link sent to the guardian.
CREATE TABLE IF NOT EXISTS public.release_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.release_forms(id),
  token_hash text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  sent_to text NOT NULL,        -- the phone number or email the link went to
  sent_by_name text NOT NULL,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);

-- One row per date range, as in the paper form's table.
CREATE TABLE IF NOT EXISTS public.release_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.release_forms(id),
  date_from date NOT NULL,
  date_to date NOT NULL,
  reason_code smallint NOT NULL CHECK (reason_code BETWEEN 1 AND 8),  -- the form's eight reasons
  mon time, tue time, wed time, thu time, fri time,                    -- release time; null = no early release that day
  supersedes uuid REFERENCES public.release_rows(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT release_rows_dates_in_order CHECK (date_to >= date_from),
  CONSTRAINT release_rows_some_day CHECK (num_nonnulls(mon, tue, wed, thu, fri) > 0)
);

-- row_id set: signs or initials that date range. row_id null: signs the agreement.
CREATE TABLE IF NOT EXISTS public.release_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.release_forms(id),
  row_id uuid REFERENCES public.release_rows(id),
  role text NOT NULL CHECK (role IN ('guardian', 'staff')),
  signer_name text NOT NULL CHECK (length(btrim(signer_name)) BETWEEN 1 AND 120),
  signature_kind text NOT NULL CHECK (signature_kind IN ('typed', 'drawn', 'initials', 'paper')),
  signature text NOT NULL CHECK (length(signature) BETWEEN 1 AND 20000),  -- typed name or initials; drawn strokes as SVG path data
  consented boolean NOT NULL,   -- agreed to sign electronically (false for paper)
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'in_app', 'paper')),
  sent_to text,                 -- copied from the link the guardian signed through
  language text CHECK (language IN ('en', 'es')),  -- the language the form was shown in
  link_id uuid REFERENCES public.release_links(id),
  paper_signed_on date,         -- paper forms: the date written next to the signature
  recorded_by uuid DEFAULT auth.uid(),  -- null when a guardian signs from a link
  signed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- The paper form's "For Site Use Only" box, kept per date range.
CREATE TABLE IF NOT EXISTS public.release_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL UNIQUE REFERENCES public.release_rows(id),
  entered_by_name text NOT NULL,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  entered_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_forms_student ON public.release_forms(student_id);
CREATE INDEX IF NOT EXISTS idx_release_links_form ON public.release_links(form_id);
CREATE INDEX IF NOT EXISTS idx_release_rows_form ON public.release_rows(form_id);
CREATE INDEX IF NOT EXISTS idx_release_signatures_form ON public.release_signatures(form_id);
CREATE INDEX IF NOT EXISTS idx_release_signatures_link ON public.release_signatures(link_id);

-- ── Server clock and append-only ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME IN ('release_forms', 'release_rows') THEN NEW.created_at := now();
  ELSIF TG_TABLE_NAME = 'release_links' THEN NEW.sent_at := now();
  ELSIF TG_TABLE_NAME = 'release_signatures' THEN NEW.signed_at := now();
  ELSIF TG_TABLE_NAME = 'release_entries' THEN NEW.entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['release_forms', 'release_links', 'release_rows', 'release_signatures', 'release_entries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_stamp', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.release_stamp()', t || '_stamp', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_update_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.release_reject_change()', t || '_no_update_delete', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.release_reject_change()', t || '_no_truncate', t);
  END LOOP;
END;
$$;

-- ── Who can do what through the API ──────────────────────────────────────────
-- Signed-in staff read everything. They insert forms, their own
-- countersignatures and Cityspan entries directly. Links, date ranges and
-- guardian signatures are only ever written by the functions below.
DROP POLICY IF EXISTS "release forms: staff can read" ON public.release_forms;
CREATE POLICY "release forms: staff can read" ON public.release_forms FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "release forms: staff start as themselves" ON public.release_forms;
CREATE POLICY "release forms: staff start as themselves" ON public.release_forms FOR
INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS "release links: staff can read" ON public.release_links;
CREATE POLICY "release links: staff can read" ON public.release_links FOR
SELECT USING (auth.role() = 'authenticated');
-- The token hash is never readable through the API.
REVOKE SELECT ON public.release_links FROM anon, authenticated;
GRANT SELECT (id, form_id, channel, sent_to, sent_by_name, sent_at, expires_at) ON public.release_links TO authenticated;

DROP POLICY IF EXISTS "release rows: staff can read" ON public.release_rows;
CREATE POLICY "release rows: staff can read" ON public.release_rows FOR
SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "release signatures: staff can read" ON public.release_signatures;
CREATE POLICY "release signatures: staff can read" ON public.release_signatures FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "release signatures: staff countersign as themselves" ON public.release_signatures;
CREATE POLICY "release signatures: staff countersign as themselves" ON public.release_signatures FOR
INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND recorded_by = auth.uid()
    AND role = 'staff'
    AND channel = 'in_app'
    AND link_id IS NULL
  );

DROP POLICY IF EXISTS "release entries: staff can read" ON public.release_entries;
CREATE POLICY "release entries: staff can read" ON public.release_entries FOR
SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "release entries: staff record as themselves" ON public.release_entries;
CREATE POLICY "release entries: staff record as themselves" ON public.release_entries FOR
INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND recorded_by = auth.uid()
  );

-- ── Helpers (not callable through the API) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_token_hash(p_token text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Looks a link up by its token and says whether it can be used. With p_lock,
-- the link row is locked for the transaction, so two submissions of the same
-- link cannot both pass the "used" check.
CREATE OR REPLACE FUNCTION public.release_check_link(p_token text, p_lock boolean)
RETURNS TABLE (status text, link_id uuid, form_id uuid, channel text, sent_to text, expires_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  l public.release_links%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 16 AND 128 THEN
    status := 'not_found';
    RETURN NEXT;
    RETURN;
  END IF;
  IF p_lock THEN
    SELECT * INTO l FROM public.release_links k WHERE k.token_hash = public.release_token_hash(p_token) FOR UPDATE;
  ELSE
    SELECT * INTO l FROM public.release_links k WHERE k.token_hash = public.release_token_hash(p_token);
  END IF;
  IF NOT FOUND THEN
    status := 'not_found';
  ELSIF EXISTS (SELECT 1 FROM public.release_signatures s WHERE s.link_id = l.id) THEN
    status := 'used';
  ELSIF EXISTS (SELECT 1 FROM public.release_links n WHERE n.form_id = l.form_id AND (n.sent_at, n.id) > (l.sent_at, l.id))
     OR EXISTS (SELECT 1 FROM public.release_forms n WHERE n.supersedes = l.form_id) THEN
    status := 'replaced';
  ELSIF l.expires_at <= now() THEN
    status := 'expired';
  ELSE
    status := 'ok';
  END IF;
  link_id := l.id;
  form_id := l.form_id;
  channel := l.channel;
  sent_to := l.sent_to;
  expires_at := l.expires_at;
  RETURN NEXT;
END;
$$;

-- Inserts date ranges from JSON and returns their ids. Anything malformed
-- raises, and the caller turns that into an 'invalid' answer.
CREATE OR REPLACE FUNCTION public.release_add_rows(p_form_id uuid, p_rows jsonb) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_supersedes uuid;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'date ranges must be a list' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_rows) > 20 THEN
    RAISE EXCEPTION 'too many date ranges' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_supersedes := NULLIF(v->>'supersedes', '')::uuid;
    IF v_supersedes IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.release_rows r WHERE r.id = v_supersedes AND r.form_id = p_form_id
    ) THEN
      RAISE EXCEPTION 'a replaced date range must be on the same form' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO public.release_rows (form_id, date_from, date_to, reason_code, mon, tue, wed, thu, fri, supersedes)
    VALUES (
      p_form_id, (v->>'date_from')::date, (v->>'date_to')::date, (v->>'reason_code')::smallint,
      NULLIF(v->>'mon', '')::time, NULLIF(v->>'tue', '')::time, NULLIF(v->>'wed', '')::time,
      NULLIF(v->>'thu', '')::time, NULLIF(v->>'fri', '')::time, v_supersedes
    )
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  RETURN v_ids;
END;
$$;

-- ── For signed-in staff ──────────────────────────────────────────────────────
-- Creates the link and returns its token — the only time the token exists
-- outside the guardian's message.
CREATE OR REPLACE FUNCTION public.release_create_link(p_form_id uuid, p_channel text, p_sent_to text, p_sent_by_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_link public.release_links%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'sign in to send a form' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.release_forms f WHERE f.id = p_form_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.release_forms n WHERE n.supersedes = p_form_id) THEN
    RETURN jsonb_build_object('status', 'replaced');
  END IF;
  INSERT INTO public.release_links (form_id, token_hash, channel, sent_to, sent_by_name, recorded_by, expires_at)
  VALUES (p_form_id, public.release_token_hash(v_token), p_channel, btrim(p_sent_to), btrim(p_sent_by_name), auth.uid(), now() + interval '14 days')
  RETURNING * INTO v_link;
  RETURN jsonb_build_object('status', 'ok', 'token', v_token, 'link_id', v_link.id, 'sent_at', v_link.sent_at, 'expires_at', v_link.expires_at);
END;
$$;

-- Records a form the family signed on paper (date ranges and the guardian's
-- signature in one step), so the site's list is complete. Staff countersign
-- afterwards like any other form.
CREATE OR REPLACE FUNCTION public.release_log_paper_form(p_form_id uuid, p_rows jsonb, p_signer_name text, p_signed_on date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_first boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'sign in to record a paper form' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.release_forms f WHERE f.id = p_form_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.release_forms n WHERE n.supersedes = p_form_id) THEN
    RETURN jsonb_build_object('status', 'replaced');
  END IF;
  v_first := NOT EXISTS (
    SELECT 1 FROM public.release_signatures s WHERE s.form_id = p_form_id AND s.row_id IS NULL AND s.role = 'guardian'
  );
  IF p_signed_on IS NULL OR p_signed_on > current_date + 1 OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR NOT COALESCE(length(btrim(p_signer_name)) BETWEEN 1 AND 120, false) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF jsonb_array_length(p_rows) = 0 AND NOT v_first THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  BEGIN
    v_ids := public.release_add_rows(p_form_id, p_rows);
    FOREACH v_id IN ARRAY v_ids LOOP
      INSERT INTO public.release_signatures (form_id, row_id, role, signer_name, signature_kind, signature, consented, channel, paper_signed_on, recorded_by)
      VALUES (p_form_id, v_id, 'guardian', btrim(p_signer_name), 'paper', btrim(p_signer_name), false, 'paper', p_signed_on, auth.uid());
    END LOOP;
    IF v_first THEN
      INSERT INTO public.release_signatures (form_id, row_id, role, signer_name, signature_kind, signature, consented, channel, paper_signed_on, recorded_by)
      VALUES (p_form_id, NULL, 'guardian', btrim(p_signer_name), 'paper', btrim(p_signer_name), false, 'paper', p_signed_on, auth.uid());
    END IF;
  EXCEPTION WHEN invalid_parameter_value OR check_violation OR not_null_violation OR invalid_text_representation
    OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR foreign_key_violation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  RETURN jsonb_build_object('status', 'saved');
END;
$$;

-- ── For the guardian, who has only the token from their link ─────────────────
-- What the guardian's page shows: the student and site as printed on the form,
-- and any date ranges already signed on it.
CREATE OR REPLACE FUNCTION public.release_form_for_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  f public.release_forms%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.release_check_link(p_token, false);
  IF c.status <> 'ok' THEN
    RETURN jsonb_build_object('status', c.status);
  END IF;
  SELECT * INTO f FROM public.release_forms x WHERE x.id = c.form_id;
  RETURN jsonb_build_object('status', 'ok', 'form', jsonb_build_object(
    'student_name', f.student_name,
    'grade', f.grade,
    'site_name', f.site_name,
    'cycle', f.cycle,
    'program_hours', f.program_hours,
    'form_version', f.form_version,
    'expires_at', c.expires_at,
    'agreement_signed', EXISTS (
      SELECT 1 FROM public.release_signatures s WHERE s.form_id = f.id AND s.row_id IS NULL AND s.role = 'guardian'
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'date_from', r.date_from, 'date_to', r.date_to, 'reason_code', r.reason_code,
        'mon', r.mon, 'tue', r.tue, 'wed', r.wed, 'thu', r.thu, 'fri', r.fri, 'signed_at', r.created_at
      ) ORDER BY r.date_from, r.created_at)
      FROM public.release_rows r
      WHERE r.form_id = f.id AND NOT EXISTS (SELECT 1 FROM public.release_rows n WHERE n.supersedes = r.id)
    ), '[]'::jsonb)
  ));
END;
$$;

-- The guardian signs: every date range they added gets their signature, and
-- the first time they also sign the agreement. All in one transaction, stamped
-- by the database clock, after which the link is used up.
CREATE OR REPLACE FUNCTION public.release_sign_as_guardian(
  p_token text, p_rows jsonb, p_signer_name text, p_signature_kind text, p_signature text, p_consented boolean, p_language text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  v_ids uuid[];
  v_id uuid;
  v_first boolean;
BEGIN
  SELECT * INTO c FROM public.release_check_link(p_token, true);
  IF c.status <> 'ok' THEN
    RETURN jsonb_build_object('status', c.status);
  END IF;
  v_first := NOT EXISTS (
    SELECT 1 FROM public.release_signatures s WHERE s.form_id = c.form_id AND s.row_id IS NULL AND s.role = 'guardian'
  );
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF NOT COALESCE(
    p_consented
    AND p_signature_kind IN ('typed', 'drawn')
    AND length(btrim(p_signer_name)) BETWEEN 1 AND 120
    AND length(p_signature) BETWEEN 1 AND 20000
    AND (p_signature_kind <> 'typed' OR length(btrim(p_signature)) BETWEEN 1 AND 120)
    AND (p_signature_kind <> 'drawn' OR p_signature ~ '^[ML0-9 .,-]+$')
    AND p_language IN ('en', 'es')
    AND (jsonb_array_length(p_rows) > 0 OR v_first),
    false
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  BEGIN
    v_ids := public.release_add_rows(c.form_id, p_rows);
    FOREACH v_id IN ARRAY v_ids LOOP
      INSERT INTO public.release_signatures (form_id, row_id, role, signer_name, signature_kind, signature, consented, channel, sent_to, language, link_id, recorded_by)
      VALUES (c.form_id, v_id, 'guardian', btrim(p_signer_name), p_signature_kind, p_signature, true, c.channel, c.sent_to, p_language, c.link_id, NULL);
    END LOOP;
    IF v_first THEN
      INSERT INTO public.release_signatures (form_id, row_id, role, signer_name, signature_kind, signature, consented, channel, sent_to, language, link_id, recorded_by)
      VALUES (c.form_id, NULL, 'guardian', btrim(p_signer_name), p_signature_kind, p_signature, true, c.channel, c.sent_to, p_language, c.link_id, NULL);
    END IF;
  EXCEPTION WHEN invalid_parameter_value OR check_violation OR not_null_violation OR invalid_text_representation
    OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR foreign_key_violation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  RETURN jsonb_build_object('status', 'signed', 'signed_at', now());
END;
$$;

-- ── Function access ──────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to the API roles by default, so
-- take it away first, then give back only what each role needs.
REVOKE ALL ON FUNCTION public.release_token_hash(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_check_link(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_add_rows(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_create_link(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_log_paper_form(uuid, jsonb, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_form_for_link(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_sign_as_guardian(text, jsonb, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.release_create_link(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_log_paper_form(uuid, jsonb, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_form_for_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_sign_as_guardian(text, jsonb, text, text, text, boolean, text) TO anon, authenticated;

-- So the API sees the new tables and functions straight away.
NOTIFY pgrst, 'reload schema';
