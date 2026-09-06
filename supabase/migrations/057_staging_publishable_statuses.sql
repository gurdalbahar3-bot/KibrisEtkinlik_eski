-- Migration 057 — Staging-safe publishable statuses (additive)
-- Scope: event_status approved/unpublished + status-guard transitions
--         + publish_event accepts draft|approved|unpublished → published.
-- Purpose: unblock Super Admin UI/E2E publish queue without replaying 051–055.
-- Staging model: audit_logs present; admin_audit_log ABSENT — do not reference it.
-- Auth: keep can_manage_event (includes is_super_admin) — do not switch to SA-only 054.
-- Does NOT: create admin_audit_log, event_change_requests, in_review workflow RPCs,
--           or replay repo 054_event_lifecycle.sql.
-- Enum ADD VALUE must run outside a surrounding transaction on older PG.

ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'unpublished';

BEGIN;

-- ------------------------------------------------------------
-- Status transition guard — allow approved/unpublished without
-- removing existing draft/published/postponed/cancelled paths.
-- ------------------------------------------------------------
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
        ARRAY['published', 'approved']
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

-- ------------------------------------------------------------
-- publish_event — staging-safe REPLACE (no admin_audit_log)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status = 'published' THEN
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'noop', true);
  END IF;

  IF v_event.status NOT IN ('draft', 'approved', 'unpublished') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  SELECT * INTO v_owner FROM public.profiles WHERE id = v_event.owner_id;
  IF v_owner.account_type NOT IN ('venue_owner', 'organizer')
     OR v_owner.verification_status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_NOT_ELIGIBLE');
  END IF;

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
  VALUES (auth.uid(), 'publish_event', 'event', p_event_id, jsonb_build_object('status', 'published'));

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'status', 'published');
END;
$$;

REVOKE ALL ON FUNCTION public.publish_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_event(uuid) TO authenticated;

COMMIT;
