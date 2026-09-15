-- Migration 063 — Organizer draft schedule/venue edit (P1.1A)
-- Additive only. Does NOT touch 001–050. Does NOT apply/alter 057.
-- Does NOT broaden events GRANT UPDATE (starts_at/ends_at/venue_id stay RPC-only).
--
-- Adds: update_event_draft_schedule_atomic
-- Auth: authenticated via can_manage_event; draft-only; venue must be active.

CREATE OR REPLACE FUNCTION public.update_event_draft_schedule_atomic(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_venue public.venues%ROWTYPE;
  v_venue_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_ID_REQUIRED');
  END IF;

  IF p_starts_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STARTS_AT_REQUIRED');
  END IF;

  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ENDS_BEFORE_START');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  -- Draft only — in_review / approved / published / others are locked.
  IF v_event.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_DRAFT');
  END IF;

  v_venue_id := COALESCE(p_venue_id, v_event.venue_id);

  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_REQUIRED');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = v_venue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF v_venue.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_ACTIVE');
  END IF;

  -- Prevent attaching an unrelated active venue (app + RPC defense in depth).
  IF v_venue.owner_id IS DISTINCT FROM v_event.owner_id
     AND NOT public.can_manage_venue(v_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_FORBIDDEN');
  END IF;

  UPDATE public.events
  SET
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    venue_id = v_venue_id,
    updated_at = now()
  WHERE id = p_event_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_DRAFT');
  END IF;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'EVENT_DRAFT_SCHEDULE_UPDATED',
    'event',
    p_event_id,
    jsonb_build_object(
      'status', v_event.status,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'venue_id', v_event.venue_id
    ),
    jsonb_build_object(
      'status', 'draft',
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'venue_id', v_venue_id
    ),
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'status', 'draft',
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'venue_id', v_venue_id
  );
END;
$$;

COMMENT ON FUNCTION public.update_event_draft_schedule_atomic(uuid, timestamptz, timestamptz, uuid) IS
  'P1.1A: Organizer draft-only starts_at/ends_at/venue_id update via SECURITY DEFINER. No column GRANT UPDATE.';

REVOKE ALL ON FUNCTION public.update_event_draft_schedule_atomic(uuid, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_event_draft_schedule_atomic(uuid, timestamptz, timestamptz, uuid)
  TO authenticated;

-- Explicit non-goals (security note):
-- * Does not GRANT UPDATE (starts_at, ends_at, venue_id) on public.events
-- * Does not alter events_update_owner_draft
-- * Does not replace publish_event / submit_event_for_review / 054 lifecycle
