-- Migration 054 — Event Lifecycle
-- Scope: event_status values in_review/approved/unpublished (additive),
--         event_change_requests (owner proposals; not event_schedule_changes),
--         CREATE OR REPLACE trg_guard_events_status (033 file not edited),
--         CREATE OR REPLACE publish_event / postpone_event / reschedule_event
--         (034 file not edited; auth is_super_admin only),
--         new lifecycle + change-request RPCs, admin_audit_log actions.
-- Depends on: 001–053 applied.
-- Does NOT modify: migrations 001–053 (especially 033, 034, 051, 052, 053).
-- Does NOT add: spider/AI, artist writes, ticket URL, QR, payment,
--               Organizer OS, Venue OS, 2D/3D, public discovery redesign.
-- Does NOT backfill events.status. Does NOT widen events_select_public.
-- Does NOT GRANT UPDATE on events.status.

-- Enum ADD VALUE must commit before the new labels are used on PG < 15.
-- Keep these statements outside the main transaction.

ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'unpublished';

BEGIN;

-- ============================================================
-- §1 Owner proposals (executed postpone/reschedule stay in 034 table)
-- ============================================================

CREATE TABLE public.event_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles (id),
  change_type text NOT NULL,
  proposed_start timestamptz NULL,
  proposed_end timestamptz NULL,
  reason text NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid NULL REFERENCES public.profiles (id),
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_change_requests_change_type_check CHECK (
    change_type IN ('postpone', 'reschedule')
  ),
  CONSTRAINT event_change_requests_status_check CHECK (
    status IN ('pending', 'accepted', 'rejected')
  )
);

CREATE INDEX event_change_requests_event_id_created_at_idx
  ON public.event_change_requests (event_id, created_at DESC);

CREATE INDEX event_change_requests_requester_id_idx
  ON public.event_change_requests (requester_id);

CREATE UNIQUE INDEX event_change_requests_one_pending_per_event_idx
  ON public.event_change_requests (event_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.event_change_requests IS
  'Owner proposals for postpone/reschedule. Executed changes remain in event_schedule_changes.';

ALTER TABLE public.event_change_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_change_requests FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_change_requests
  FROM anon, authenticated, PUBLIC;
REVOKE INSERT (
  event_id, requester_id, change_type, proposed_start, proposed_end, reason
) ON TABLE public.event_change_requests FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.event_change_requests TO authenticated;

CREATE POLICY event_change_requests_select_own ON public.event_change_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS event_change_requests_insert_owner ON public.event_change_requests;

-- No INSERT / UPDATE / DELETE client policies. Writes only via RPC.

-- ============================================================
-- §2 Status guard — CREATE OR REPLACE in 054 only (do not edit 033)
-- Trigger trg_guard_events_status already exists; function body is replaced.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_guard_events_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status::text
    WHEN 'draft' THEN
      PERFORM public.trg_assert_allowed_transition(
        'event', OLD.status::text, NEW.status::text,
        ARRAY['in_review', 'published']
      );
    WHEN 'in_review' THEN
      PERFORM public.trg_assert_allowed_transition(
        'event', OLD.status::text, NEW.status::text,
        ARRAY['approved']
      );
    WHEN 'approved' THEN
      PERFORM public.trg_assert_allowed_transition(
        'event', OLD.status::text, NEW.status::text,
        ARRAY['published']
      );
    WHEN 'published' THEN
      PERFORM public.trg_assert_allowed_transition(
        'event', OLD.status::text, NEW.status::text,
        ARRAY['postponed', 'cancelled', 'completed', 'unpublished']
      );
    WHEN 'postponed' THEN
      PERFORM public.trg_assert_allowed_transition(
        'event', OLD.status::text, NEW.status::text,
        ARRAY['published', 'cancelled', 'completed']
      );
    WHEN 'unpublished' THEN
      PERFORM public.trg_assert_allowed_transition(
        'event', OLD.status::text, NEW.status::text,
        ARRAY['published', 'cancelled']
      );
    ELSE
      RAISE EXCEPTION
        'Invalid event status transition: % → % (terminal state)',
        OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

-- ============================================================
-- §3 publish / postpone / reschedule — SA only (034 file not edited)
-- Keep 034 zone + owner-eligibility catalog checks and postpone side effects.
-- ============================================================

CREATE OR REPLACE FUNCTION public.publish_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
  v_action text;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  -- Auth is Super Admin only. Owner / can_manage_event is FORBIDDEN.
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status = 'published' THEN
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'noop', true);
  END IF;

  IF v_event.status = 'draft' THEN
    v_action := 'EVENT_PUBLISHED_EMERGENCY';
  ELSIF v_event.status IN ('approved', 'unpublished') THEN
    v_action := 'EVENT_PUBLISHED';
  ELSE
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  SELECT * INTO v_owner FROM public.profiles WHERE id = v_event.owner_id;
  IF v_owner.account_type NOT IN ('venue_owner', 'organizer')
     OR v_owner.verification_status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_NOT_ELIGIBLE');
  END IF;

  -- Zone / type consistency (spec §5 zone mode rules) — kept from 034
  IF EXISTS (
    SELECT 1 FROM public.event_ticket_zones AS z
    WHERE z.event_id = p_event_id
      AND z.is_active
      AND z.sale_mode = 'ticket_based'
      AND NOT EXISTS (
        SELECT 1 FROM public.event_ticket_types AS t
        WHERE t.zone_id = z.id AND t.is_active
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_ZONE_WITHOUT_TYPE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_ticket_zones AS z
    WHERE z.event_id = p_event_id
      AND z.is_active
      AND z.sale_mode = 'seat_based'
      AND NOT EXISTS (
        SELECT 1 FROM public.event_seat_pricing AS sp
        WHERE sp.zone_id = z.id
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_ZONE_WITHOUT_PRICING');
  END IF;

  UPDATE public.events
  SET status = 'published', updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (v_actor_id, 'publish_event', 'event', p_event_id, jsonb_build_object('status', 'published'));

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    v_action,
    'event',
    p_event_id,
    jsonb_build_object('status', v_event.status),
    jsonb_build_object('status', 'published'),
    jsonb_build_object('emergency', v_action = 'EVENT_PUBLISHED_EMERGENCY')
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'published');
END;
$$;

CREATE OR REPLACE FUNCTION public.postpone_event(
  p_event_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_order RECORD;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status = 'postponed' THEN
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'noop', true);
  END IF;

  IF v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  -- starts_at / ends_at are NOT modified (spec §6.1)
  UPDATE public.events
  SET status = 'postponed', updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.event_schedule_changes (
    event_id, change_type,
    previous_status, new_status,
    previous_starts_at, previous_ends_at,
    new_starts_at, new_ends_at,
    reason, changed_by
  )
  VALUES (
    p_event_id, 'postpone',
    v_event.status, 'postponed',
    v_event.starts_at, v_event.ends_at,
    v_event.starts_at, v_event.ends_at,
    p_reason, v_actor_id
  );

  -- Cleanup of pending records; paid/confirmed rows are preserved (034)
  FOR v_order IN
    SELECT id FROM public.orders
    WHERE event_id = p_event_id AND status = 'pending_payment'
    FOR UPDATE
  LOOP
    PERFORM public.expire_order_atomic(v_order.id);
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (
    v_actor_id, 'postpone_event', 'event', p_event_id,
    jsonb_build_object('status', 'postponed', 'reason', p_reason)
  );

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_POSTPONED',
    'event',
    p_event_id,
    jsonb_build_object('status', v_event.status),
    jsonb_build_object('status', 'postponed'),
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'postponed');
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_event(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_starts_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STARTS_AT_REQUIRED');
  END IF;

  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TIME_RANGE');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status NOT IN ('postponed', 'published') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  UPDATE public.events
  SET starts_at = p_starts_at,
      ends_at = p_ends_at,
      status = 'published',
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.event_schedule_changes (
    event_id, change_type,
    previous_status, new_status,
    previous_starts_at, previous_ends_at,
    new_starts_at, new_ends_at,
    changed_by
  )
  VALUES (
    p_event_id, 'reschedule',
    v_event.status, 'published',
    v_event.starts_at, v_event.ends_at,
    p_starts_at, p_ends_at,
    v_actor_id
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    v_actor_id, 'reschedule_event', 'event', p_event_id,
    jsonb_build_object('starts_at', v_event.starts_at, 'ends_at', v_event.ends_at, 'status', v_event.status),
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'status', 'published')
  );

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_RESCHEDULED',
    'event',
    p_event_id,
    jsonb_build_object(
      'status', v_event.status,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at
    ),
    jsonb_build_object(
      'status', 'published',
      'starts_at', p_starts_at,
      'ends_at', p_ends_at
    ),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'published');
END;
$$;

-- ============================================================
-- §4 New lifecycle RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_event_for_review(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  -- Organizer / VO of that event (can_manage_event). SA may also submit.
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_event.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.events
  SET status = 'in_review',
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'EVENT_SUBMITTED',
    'event',
    p_event_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'in_review'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'in_review');
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status IS DISTINCT FROM 'in_review' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.events
  SET status = 'approved',
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_APPROVED',
    'event',
    p_event_id,
    jsonb_build_object('status', 'in_review'),
    jsonb_build_object('status', 'approved'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.events
  SET status = 'unpublished',
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_UNPUBLISHED',
    'event',
    p_event_id,
    jsonb_build_object('status', 'published'),
    jsonb_build_object('status', 'unpublished'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'unpublished');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event(
  p_event_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status NOT IN ('published', 'postponed', 'unpublished') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.events
  SET status = 'cancelled',
      cancellation_reason = v_reason,
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_CANCELLED',
    'event',
    p_event_id,
    jsonb_build_object('status', v_event.status),
    jsonb_build_object('status', 'cancelled', 'cancellation_reason', v_reason),
    jsonb_build_object('reason', v_reason)
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status NOT IN ('published', 'postponed') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.events
  SET status = 'completed',
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_COMPLETED',
    'event',
    p_event_id,
    jsonb_build_object('status', v_event.status),
    jsonb_build_object('status', 'completed'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_event_schedule_change(
  p_event_id uuid,
  p_change_type text,
  p_proposed_start timestamptz DEFAULT NULL,
  p_proposed_end timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_request_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_change_type IS NULL OR p_change_type NOT IN ('postpone', 'reschedule') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CHANGE_TYPE');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF NOT public.owns_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_change_type = 'postpone' AND v_event.status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  IF p_change_type = 'reschedule' AND v_event.status NOT IN ('published', 'postponed') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  IF p_change_type = 'reschedule' THEN
    IF p_proposed_start IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'STARTS_AT_REQUIRED');
    END IF;
    IF p_proposed_end IS NOT NULL AND p_proposed_end <= p_proposed_start THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TIME_RANGE');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.event_change_requests AS r
    WHERE r.event_id = p_event_id
      AND r.status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'REQUEST_ALREADY_PENDING');
  END IF;

  INSERT INTO public.event_change_requests (
    event_id,
    requester_id,
    change_type,
    proposed_start,
    proposed_end,
    reason,
    status
  )
  VALUES (
    p_event_id,
    v_actor_id,
    p_change_type,
    CASE WHEN p_change_type = 'reschedule' THEN p_proposed_start ELSE NULL END,
    CASE WHEN p_change_type = 'reschedule' THEN p_proposed_end ELSE NULL END,
    NULLIF(btrim(p_reason), ''),
    'pending'
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'EVENT_CHANGE_PROPOSED',
    'event',
    p_event_id,
    jsonb_build_object(
      'status', v_event.status,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at
    ),
    jsonb_build_object(
      'status', v_event.status,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at
    ),
    jsonb_build_object(
      'request_id', v_request_id,
      'change_type', p_change_type,
      'proposed_start', p_proposed_start,
      'proposed_end', p_proposed_end
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'event_id', p_event_id,
    'status', 'pending'
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'REQUEST_ALREADY_PENDING');
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_event_change_request(
  p_request_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_req public.event_change_requests%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_inner jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'REQUEST_NOT_FOUND');
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_DECISION');
  END IF;

  SELECT * INTO v_req
  FROM public.event_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'REQUEST_NOT_FOUND');
  END IF;

  IF v_req.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'REQUEST_NOT_PENDING');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_req.event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF p_decision = 'accept' THEN
    IF v_req.change_type = 'postpone' THEN
      v_inner := public.postpone_event(v_req.event_id, v_req.reason);
    ELSE
      v_inner := public.reschedule_event(
        v_req.event_id,
        v_req.proposed_start,
        v_req.proposed_end
      );
    END IF;

    IF COALESCE(v_inner->>'success', 'false') <> 'true' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', COALESCE(v_inner->>'error_code', 'INVALID_STATE')
      );
    END IF;
  END IF;

  UPDATE public.event_change_requests
  SET status = CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'rejected' END,
      decided_by = v_actor_id,
      decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'EVENT_CHANGE_DECIDED',
    'event',
    v_req.event_id,
    jsonb_build_object(
      'event_status', v_event.status,
      'request_status', 'pending'
    ),
    jsonb_build_object(
      'request_status', v_req.status,
      'decision', p_decision
    ),
    jsonb_build_object(
      'request_id', p_request_id,
      'change_type', v_req.change_type,
      'decision', p_decision
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'event_id', v_req.event_id,
    'decision', p_decision,
    'status', v_req.status
  );
END;
$$;

-- ============================================================
-- §5 Grants — REVOKE PUBLIC/anon; GRANT authenticated; in-function auth
-- ============================================================

REVOKE ALL ON FUNCTION public.publish_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.postpone_event(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_event(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_event_for_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unpublish_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_event(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.propose_event_schedule_change(uuid, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_event_change_request(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.publish_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.postpone_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_event(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_event_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_event_schedule_change(uuid, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_event_change_request(uuid, text) TO authenticated;

-- ============================================================
-- §6 RLS keepers — do not widen public SELECT; draft UPDATE only
-- events_select_public stays published|postponed|completed.
-- events_update_owner_draft stays status=draft only.
-- No client GRANT UPDATE on events.status.
-- ============================================================

-- events_select_public / events_select_owner / events_update_owner_draft kept.
-- After submit (status=in_review) the owner cannot patch fields via client UPDATE.

COMMIT;
