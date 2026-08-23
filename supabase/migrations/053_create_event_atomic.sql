-- Migration 053 — Event Create Atomic
-- Scope: events.created_by, create_event_atomic (CREATE ≠ PUBLISH), RPC-only INSERT,
--         EVENT_CREATED audit. Keep events_select_* and events_update_owner_draft.
-- Depends on: 001–052 applied.
-- Does NOT modify: migrations 001–052 (especially 034, 047, 049, 051, 052).
-- Does NOT CREATE OR REPLACE: publish_event / postpone_event / reschedule_event.
-- Does NOT add: ticket-url columns, artist writes, event review lifecycle,
--               047/049 nested upserts, discovery, QR/payment/POS, Venue OS.

BEGIN;

-- ============================================================
-- §1 created_by (RPC actor). Do not invent other columns.
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.profiles (id);

UPDATE public.events
SET created_by = owner_id
WHERE created_by IS NULL;

ALTER TABLE public.events
  ALTER COLUMN created_by SET NOT NULL;

CREATE INDEX IF NOT EXISTS events_created_by_idx
  ON public.events (created_by);

-- ============================================================
-- §2 Owner eligibility — identical to 052 venue_owner_is_eligible
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_owner_is_eligible(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = p_owner_id
      AND p.account_type IN ('venue_owner', 'organizer')
      AND p.verification_status = 'approved'
      AND NOT EXISTS (
        SELECT 1
        FROM public.super_admin_profiles AS sap
        WHERE sap.profile_id = p.id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.event_owner_is_eligible(uuid) FROM PUBLIC;

-- ============================================================
-- §3 create_event_atomic — CREATE ≠ PUBLISH (status hardcoded 'draft')
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_event_atomic(
  p_title text,
  p_venue_id uuid,
  p_category text,
  p_starts_at timestamptz,
  p_description text DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL,
  p_cover text DEFAULT NULL,
  p_is_free boolean DEFAULT false,
  p_is_wedding boolean DEFAULT false,
  p_owner_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
  v_event_id uuid;
  v_venue_status text;
  v_org public.organizations%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TITLE_REQUIRED');
  END IF;

  IF p_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_REQUIRED');
  END IF;

  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CATEGORY_REQUIRED');
  END IF;

  IF p_starts_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STARTS_AT_REQUIRED');
  END IF;

  IF public.is_super_admin() THEN
    IF p_owner_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_REQUIRED');
    END IF;
    IF p_owner_id = v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SA_CANNOT_SELF_OWN');
    END IF;
    v_owner_id := p_owner_id;
  ELSE
    v_owner_id := COALESCE(p_owner_id, v_actor_id);
    IF v_owner_id IS DISTINCT FROM v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_NOT_SELF');
    END IF;
  END IF;

  IF NOT public.event_owner_is_eligible(v_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_NOT_ELIGIBLE');
  END IF;

  SELECT v.status INTO v_venue_status
  FROM public.venues AS v
  WHERE v.id = p_venue_id;

  IF v_venue_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  -- Active only. Reject hidden / archived / draft / in_review / leftover inactive.
  IF v_venue_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_ACTIVE');
  END IF;

  IF p_organization_id IS NOT NULL THEN
    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORGANIZATION_NOT_FOUND');
    END IF;

    IF v_org.status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORGANIZATION_INACTIVE');
    END IF;

    IF NOT (
      public.is_super_admin()
      OR public.can_manage_organization(p_organization_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORGANIZATION_FORBIDDEN');
    END IF;
  END IF;

  v_event_id := gen_random_uuid();

  INSERT INTO public.events (
    id,
    owner_id,
    created_by,
    venue_id,
    title,
    description,
    category,
    is_free,
    is_wedding,
    status,
    starts_at,
    ends_at,
    cover_image_url,
    organization_id
  )
  VALUES (
    v_event_id,
    v_owner_id,
    v_actor_id,
    p_venue_id,
    btrim(p_title),
    NULLIF(btrim(p_description), ''),
    btrim(p_category),
    COALESCE(p_is_free, false),
    COALESCE(p_is_wedding, false),
    'draft',
    p_starts_at,
    p_ends_at,
    NULLIF(btrim(p_cover), ''),
    p_organization_id
  );

  INSERT INTO public.admin_audit_log (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    old_state,
    new_state,
    metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'EVENT_CREATED',
    'event',
    v_event_id,
    NULL,
    jsonb_build_object(
      'status', 'draft',
      'owner_id', v_owner_id,
      'created_by', v_actor_id
    ),
    jsonb_build_object(
      'venue_id', p_venue_id,
      'organization_id', p_organization_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'status', 'draft',
    'owner_id', v_owner_id,
    'created_by', v_actor_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_atomic(
  text, uuid, text, timestamptz, text, timestamptz, text, boolean, boolean, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_event_atomic(
  text, uuid, text, timestamptz, text, timestamptz, text, boolean, boolean, uuid, uuid
) TO authenticated;

-- ============================================================
-- §4 RLS — drop client INSERT; keep SELECT + draft UPDATE
-- ============================================================

DROP POLICY IF EXISTS events_insert_owner_draft ON public.events;

REVOKE INSERT ON TABLE public.events FROM PUBLIC;
REVOKE INSERT ON TABLE public.events FROM anon, authenticated;
REVOKE INSERT (
  owner_id, venue_id, title, description, category,
  is_free, is_wedding, starts_at, ends_at, cover_image_url
) ON public.events FROM PUBLIC, anon, authenticated;

-- events_select_public / events_select_owner / events_select_org_member kept.
-- events_update_owner_draft kept. No event publish / lifecycle RPCs here.

COMMIT;
