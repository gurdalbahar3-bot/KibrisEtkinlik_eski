-- Migration 052 — Venue Create + Venue Lifecycle
-- Scope: expand venues.status CHECK (status column already exists), created_by,
--         create_venue_atomic, tight lifecycle RPCs, RPC-only writes,
--         can_manage_venue, 043 layout write guards (CREATE OR REPLACE here;
--         043_*.sql is not edited).
-- Depends on: 001–051 applied.
-- Does NOT modify: migrations 001–051, 043 file, events, event publish RPC,
--                  discovery architecture, 051 approval RPC/audit behavior.
-- Does NOT add: event-create RPCs, ticket-url columns, event lifecycle,
--               artist / QR / payment / POS / Organizer OS / spider / AI.

BEGIN;

-- ============================================================
-- §1 created_by (RPC actor). status column already exists — do not ADD it.
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.profiles (id);

UPDATE public.venues
SET created_by = owner_id
WHERE created_by IS NULL;

ALTER TABLE public.venues
  ALTER COLUMN created_by SET NOT NULL;

CREATE INDEX IF NOT EXISTS venues_created_by_idx
  ON public.venues (created_by);

CREATE INDEX IF NOT EXISTS venues_status_idx
  ON public.venues (status);

-- ============================================================
-- §2 Status CHECK backfill
-- Sequence: report inactive → widen CHECK → UPDATE non-active to active →
--           assert zero non-active → drop inactive from CHECK → DEFAULT draft.
-- Existing public venues remain active. New rows default to draft.
-- ============================================================

DO $$
DECLARE
  v_inactive_count integer;
  v_non_active_count integer;
BEGIN
  SELECT count(*) INTO v_inactive_count
  FROM public.venues
  WHERE status = 'inactive';

  RAISE NOTICE '052 backfill: venues.status=inactive count=%', v_inactive_count;

  ALTER TABLE public.venues
    DROP CONSTRAINT IF EXISTS venues_status_check;

  ALTER TABLE public.venues
    ADD CONSTRAINT venues_status_check CHECK (
      status IN (
        'active',
        'inactive',
        'draft',
        'in_review',
        'hidden',
        'archived'
      )
    );

  UPDATE public.venues
  SET status = 'active',
      updated_at = now()
  WHERE status IS DISTINCT FROM 'active';

  SELECT count(*) INTO v_non_active_count
  FROM public.venues
  WHERE status IS DISTINCT FROM 'active';

  IF v_non_active_count <> 0 THEN
    RAISE EXCEPTION
      '052 backfill failed: % non-active venues remain',
      v_non_active_count;
  END IF;

  ALTER TABLE public.venues
    DROP CONSTRAINT venues_status_check;

  ALTER TABLE public.venues
    ADD CONSTRAINT venues_status_check CHECK (
      status IN ('draft', 'in_review', 'active', 'hidden', 'archived')
    );

  ALTER TABLE public.venues
    ALTER COLUMN status SET DEFAULT 'draft';
END $$;

-- ============================================================
-- §3 Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_manage_venue(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.owns_venue(p_venue_id)
      OR EXISTS (
        SELECT 1
        FROM public.venues AS v
        WHERE v.id = p_venue_id
          AND v.organization_id IS NOT NULL
          AND public.can_manage_organization(v.organization_id)
      );
$$;

CREATE OR REPLACE FUNCTION public.venue_owner_is_eligible(p_owner_id uuid)
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

CREATE OR REPLACE FUNCTION public.venue_layout_assert_writable(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT v.status INTO v_status
  FROM public.venues AS v
  WHERE v.id = p_venue_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_venue(p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_status IN ('hidden', 'archived') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_EDITABLE');
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_actor_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN 'super_admin'
    ELSE (
      SELECT p.account_type
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_venue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_owner_is_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_layout_assert_writable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_actor_role() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_venue(uuid) TO authenticated;

-- ============================================================
-- §4 create_venue_atomic — CREATE ≠ PUBLISH (status=draft)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_venue_atomic(
  p_name text,
  p_owner_id uuid DEFAULT NULL,
  p_venue_category text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_capacity integer DEFAULT NULL,
  p_district_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_floor_plan_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
  v_venue_id uuid;
  v_org public.organizations%ROWTYPE;
  v_district public.kktc_districts%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
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

  IF NOT public.venue_owner_is_eligible(v_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_NOT_ELIGIBLE');
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

  IF p_district_id IS NOT NULL THEN
    SELECT * INTO v_district
    FROM public.kktc_districts
    WHERE id = p_district_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'DISTRICT_NOT_FOUND');
    END IF;

    IF v_district.is_active IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'DISTRICT_INACTIVE');
    END IF;
  END IF;

  v_venue_id := gen_random_uuid();

  INSERT INTO public.venues (
    id,
    owner_id,
    created_by,
    name,
    venue_category,
    address,
    city,
    region,
    latitude,
    longitude,
    capacity,
    floor_plan_url,
    status,
    district_id,
    organization_id
  )
  VALUES (
    v_venue_id,
    v_owner_id,
    v_actor_id,
    btrim(p_name),
    NULLIF(btrim(p_venue_category), ''),
    NULLIF(btrim(p_address), ''),
    NULLIF(btrim(p_city), ''),
    NULLIF(btrim(p_region), ''),
    p_latitude,
    p_longitude,
    p_capacity,
    NULLIF(btrim(p_floor_plan_url), ''),
    'draft',
    p_district_id,
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
    'VENUE_CREATED',
    'venue',
    v_venue_id,
    NULL,
    jsonb_build_object(
      'status', 'draft',
      'owner_id', v_owner_id,
      'created_by', v_actor_id
    ),
    jsonb_build_object(
      'organization_id', p_organization_id,
      'district_id', p_district_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', v_venue_id,
    'status', 'draft',
    'owner_id', v_owner_id,
    'created_by', v_actor_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- ============================================================
-- §5 update_venue_atomic — owner/org/SA edit; hidden/archived forbidden
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_venue_atomic(
  p_venue_id uuid,
  p_name text DEFAULT NULL,
  p_venue_category text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_district_id uuid DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_capacity integer DEFAULT NULL,
  p_floor_plan_url text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_venue public.venues%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_district public.kktc_districts%ROWTYPE;
  v_next_org uuid;
  v_next_district uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_venue(p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_venue.status IN ('hidden', 'archived') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_EDITABLE');
  END IF;

  IF NOT public.is_super_admin() AND v_venue.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_EDITABLE');
  END IF;

  v_next_org := v_venue.organization_id;
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

    v_next_org := p_organization_id;
  END IF;

  v_next_district := v_venue.district_id;
  IF p_district_id IS NOT NULL THEN
    SELECT * INTO v_district
    FROM public.kktc_districts
    WHERE id = p_district_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'DISTRICT_NOT_FOUND');
    END IF;

    IF v_district.is_active IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'DISTRICT_INACTIVE');
    END IF;

    v_next_district := p_district_id;
  END IF;

  UPDATE public.venues
  SET
    name = COALESCE(NULLIF(btrim(p_name), ''), name),
    venue_category = CASE
      WHEN p_venue_category IS NULL THEN venue_category
      ELSE NULLIF(btrim(p_venue_category), '')
    END,
    address = CASE
      WHEN p_address IS NULL THEN address
      ELSE NULLIF(btrim(p_address), '')
    END,
    city = CASE
      WHEN p_city IS NULL THEN city
      ELSE NULLIF(btrim(p_city), '')
    END,
    region = CASE
      WHEN p_region IS NULL THEN region
      ELSE NULLIF(btrim(p_region), '')
    END,
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    capacity = COALESCE(p_capacity, capacity),
    floor_plan_url = CASE
      WHEN p_floor_plan_url IS NULL THEN floor_plan_url
      ELSE NULLIF(btrim(p_floor_plan_url), '')
    END,
    district_id = v_next_district,
    organization_id = v_next_org,
    updated_at = now()
  WHERE id = p_venue_id;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'status', v_venue.status
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- ============================================================
-- §6 Lifecycle RPCs — tight transitions only. No DELETE RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_venue_for_review(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_venue public.venues%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_venue(p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_venue.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.venues
  SET status = 'in_review',
      updated_at = now()
  WHERE id = p_venue_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'VENUE_SUBMITTED',
    'venue',
    p_venue_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'in_review'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'status', 'in_review');
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_venue(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_venue public.venues%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF v_venue.status IS DISTINCT FROM 'in_review' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.venues
  SET status = 'active',
      updated_at = now()
  WHERE id = p_venue_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'VENUE_APPROVED',
    'venue',
    p_venue_id,
    jsonb_build_object('status', 'in_review'),
    jsonb_build_object('status', 'active'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_venue(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_venue public.venues%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF v_venue.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.venues
  SET status = 'hidden',
      updated_at = now()
  WHERE id = p_venue_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'VENUE_HIDDEN',
    'venue',
    p_venue_id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'hidden'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'status', 'hidden');
END;
$$;

CREATE OR REPLACE FUNCTION public.unhide_venue(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_venue public.venues%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF v_venue.status IS DISTINCT FROM 'hidden' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.venues
  SET status = 'active',
      updated_at = now()
  WHERE id = p_venue_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'VENUE_UNHIDDEN',
    'venue',
    p_venue_id,
    jsonb_build_object('status', 'hidden'),
    jsonb_build_object('status', 'active'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_venue(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_venue public.venues%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_venue
  FROM public.venues
  WHERE id = p_venue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF v_venue.status IS DISTINCT FROM 'hidden' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TRANSITION');
  END IF;

  UPDATE public.venues
  SET status = 'archived',
      updated_at = now()
  WHERE id = p_venue_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    'super_admin',
    'VENUE_ARCHIVED',
    'venue',
    p_venue_id,
    jsonb_build_object('status', 'hidden'),
    jsonb_build_object('status', 'archived'),
    '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'status', 'archived');
END;
$$;

-- ============================================================
-- §7 RLS — keep SELECT policies; no client INSERT/UPDATE/DELETE
-- venues_select_public (status='active') is not rewritten.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON TABLE public.venues FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.venues FROM anon, authenticated;

DROP POLICY IF EXISTS venue_areas_select_manager ON public.venue_areas;
CREATE POLICY venue_areas_select_manager ON public.venue_areas
  FOR SELECT TO authenticated
  USING (public.can_manage_venue(venue_id));

DROP POLICY IF EXISTS venue_tables_select_manager ON public.venue_tables;
CREATE POLICY venue_tables_select_manager ON public.venue_tables
  FOR SELECT TO authenticated
  USING (public.can_manage_venue(venue_id));

DROP POLICY IF EXISTS venue_seats_select_manager ON public.venue_seats;
CREATE POLICY venue_seats_select_manager ON public.venue_seats
  FOR SELECT TO authenticated
  USING (public.can_manage_venue(venue_id));

DROP POLICY IF EXISTS venue_layout_objects_select_manager ON public.venue_layout_objects;
CREATE POLICY venue_layout_objects_select_manager ON public.venue_layout_objects
  FOR SELECT TO authenticated
  USING (public.can_manage_venue(venue_id));

-- ============================================================
-- §8 REVOKE / GRANT — venue lifecycle RPCs
-- ============================================================

REVOKE ALL ON FUNCTION public.create_venue_atomic(
  text, uuid, text, text, text, text, numeric, numeric, integer, uuid, uuid, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_venue_atomic(
  uuid, text, text, text, text, text, uuid, numeric, numeric, integer, text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_venue_for_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_venue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hide_venue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unhide_venue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_venue(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_venue_atomic(
  text, uuid, text, text, text, text, numeric, numeric, integer, uuid, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_venue_atomic(
  uuid, text, text, text, text, text, uuid, numeric, numeric, integer, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_venue_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_venue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_venue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unhide_venue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_venue(uuid) TO authenticated;

-- ============================================================
-- §9 043 layout write RPCs — replaced here only (do not edit 043_*.sql)
-- Guards: can_manage_venue AND status NOT IN (hidden, archived).
-- No layout DELETE of venue/areas.
-- ============================================================
-- 052 replacement of 043 update_venue_layout_canvas_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.update_venue_layout_canvas_atomic(
  p_venue_id uuid,
  p_canvas_width numeric DEFAULT NULL,
  p_canvas_height numeric DEFAULT NULL,
  p_grid_size numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  UPDATE public.venues
  SET layout_canvas_width = COALESCE(p_canvas_width, layout_canvas_width),
      layout_canvas_height = COALESCE(p_canvas_height, layout_canvas_height),
      layout_grid_size = COALESCE(p_grid_size, layout_grid_size),
      updated_at = now()
  WHERE id = p_venue_id;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'layout_canvas_width', p_canvas_width,
    'layout_canvas_height', p_canvas_height,
    'layout_grid_size', p_grid_size
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
END;
$$;

-- 052 replacement of 043 upsert_venue_area_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.upsert_venue_area_atomic(
  p_venue_id uuid,
  p_name text,
  p_area_type text,
  p_capacity integer,
  p_sort_order integer DEFAULT 0,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
  v_area_id uuid := p_area_id;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  IF p_area_id IS NULL THEN
    v_area_id := gen_random_uuid();

    INSERT INTO public.venue_areas (
      id, venue_id, name, area_type, capacity, sort_order,
      position_x, position_y, width, height, rotation, shape
    )
    VALUES (
      v_area_id, p_venue_id, p_name, p_area_type, p_capacity, p_sort_order,
      p_position_x, p_position_y, p_width, p_height, p_rotation, p_shape
    );
  ELSE
    UPDATE public.venue_areas
    SET name = p_name,
        area_type = p_area_type,
        capacity = p_capacity,
        sort_order = p_sort_order,
        position_x = p_position_x,
        position_y = p_position_y,
        width = p_width,
        height = p_height,
        rotation = p_rotation,
        shape = p_shape
    WHERE id = p_area_id
      AND venue_id = p_venue_id;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.venue_areas WHERE id = p_area_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'AREA_VENUE_MISMATCH');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'AREA_NOT_FOUND');
    END IF;

    v_area_id := p_area_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'area_id', v_area_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- 052 replacement of 043 upsert_venue_table_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.upsert_venue_table_atomic(
  p_venue_id uuid,
  p_table_number text,
  p_capacity integer,
  p_table_type text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_elevation numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
  v_table_id uuid := p_table_id;
  v_existing public.venue_tables%ROWTYPE;
  v_area_error text;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_area_error := public.venue_layout_assert_area_belongs_to_venue(p_venue_id, p_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF p_table_id IS NULL THEN
    INSERT INTO public.venue_tables (
      venue_id, area_id, table_number, capacity, table_type,
      position_x, position_y, width, depth, height, elevation, rotation, shape
    )
    VALUES (
      p_venue_id, p_area_id, p_table_number, p_capacity, p_table_type,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_elevation,
      p_rotation, p_shape
    )
    RETURNING id INTO v_table_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.venue_tables
    WHERE id = p_table_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_NOT_FOUND');
    END IF;

    IF v_existing.venue_id IS DISTINCT FROM p_venue_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_VENUE_MISMATCH');
    END IF;

    IF public.venue_layout_is_table_in_use(p_table_id) THEN
      IF p_table_number IS DISTINCT FROM v_existing.table_number
          OR p_capacity IS DISTINCT FROM v_existing.capacity
          OR p_table_type IS DISTINCT FROM v_existing.table_type THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_IN_USE');
      END IF;
    END IF;

    UPDATE public.venue_tables
    SET area_id = p_area_id,
        table_number = p_table_number,
        capacity = p_capacity,
        table_type = p_table_type,
        position_x = COALESCE(p_position_x, v_existing.position_x),
        position_y = COALESCE(p_position_y, v_existing.position_y),
        width = COALESCE(p_width, v_existing.width),
        depth = COALESCE(p_depth, v_existing.depth),
        height = COALESCE(p_height, v_existing.height),
        elevation = COALESCE(p_elevation, v_existing.elevation),
        rotation = COALESCE(p_rotation, v_existing.rotation),
        shape = COALESCE(p_shape, v_existing.shape)
    WHERE id = p_table_id
      AND venue_id = p_venue_id;

    v_table_id := p_table_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'table_id', v_table_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- 052 replacement of 043 upsert_venue_seat_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.upsert_venue_seat_atomic(
  p_venue_id uuid,
  p_seat_number text,
  p_section text DEFAULT NULL,
  p_row_label text DEFAULT NULL,
  p_seat_type text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_seat_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
  v_seat_id uuid := p_seat_id;
  v_existing public.venue_seats%ROWTYPE;
  v_area_error text;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_area_error := public.venue_layout_assert_area_belongs_to_venue(p_venue_id, p_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF p_seat_id IS NULL THEN
    INSERT INTO public.venue_seats (
      venue_id, area_id, section, row_label, seat_number, seat_type,
      position_x, position_y, width, depth, height, rotation, shape
    )
    VALUES (
      p_venue_id, p_area_id, p_section, p_row_label, p_seat_number, p_seat_type,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_rotation, p_shape
    )
    RETURNING id INTO v_seat_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.venue_seats
    WHERE id = p_seat_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_NOT_FOUND');
    END IF;

    IF v_existing.venue_id IS DISTINCT FROM p_venue_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_VENUE_MISMATCH');
    END IF;

    IF public.venue_layout_is_seat_in_use(p_seat_id) THEN
      IF p_section IS DISTINCT FROM v_existing.section
          OR p_row_label IS DISTINCT FROM v_existing.row_label
          OR p_seat_number IS DISTINCT FROM v_existing.seat_number
          OR p_seat_type IS DISTINCT FROM v_existing.seat_type THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_IN_USE');
      END IF;
    END IF;

    UPDATE public.venue_seats
    SET area_id = p_area_id,
        section = p_section,
        row_label = p_row_label,
        seat_number = p_seat_number,
        seat_type = p_seat_type,
        position_x = COALESCE(p_position_x, v_existing.position_x),
        position_y = COALESCE(p_position_y, v_existing.position_y),
        width = COALESCE(p_width, v_existing.width),
        depth = COALESCE(p_depth, v_existing.depth),
        height = COALESCE(p_height, v_existing.height),
        rotation = COALESCE(p_rotation, v_existing.rotation),
        shape = COALESCE(p_shape, v_existing.shape)
    WHERE id = p_seat_id
      AND venue_id = p_venue_id;

    v_seat_id := p_seat_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'seat_id', v_seat_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- 052 replacement of 043 upsert_venue_layout_object_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.upsert_venue_layout_object_atomic(
  p_venue_id uuid,
  p_object_type text,
  p_name text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_elevation numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_z_index integer DEFAULT 0,
  p_is_visible boolean DEFAULT true,
  p_object_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
  v_object_id uuid := p_object_id;
  v_area_error text;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_area_error := public.venue_layout_assert_area_belongs_to_venue(p_venue_id, p_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF p_object_id IS NULL THEN
    INSERT INTO public.venue_layout_objects (
      venue_id, area_id, object_type, name,
      position_x, position_y, width, depth, height, elevation, rotation, shape,
      z_index, is_visible, created_by
    )
    VALUES (
      p_venue_id, p_area_id, p_object_type, p_name,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_elevation,
      p_rotation, p_shape, p_z_index, p_is_visible, v_user_id
    )
    RETURNING id INTO v_object_id;
  ELSE
    UPDATE public.venue_layout_objects
    SET area_id = p_area_id,
        object_type = p_object_type,
        name = p_name,
        position_x = p_position_x,
        position_y = p_position_y,
        width = p_width,
        depth = p_depth,
        height = p_height,
        elevation = p_elevation,
        rotation = p_rotation,
        shape = p_shape,
        z_index = p_z_index,
        is_visible = p_is_visible,
        updated_at = now()
    WHERE id = p_object_id
      AND venue_id = p_venue_id;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = p_object_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_VENUE_MISMATCH');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_NOT_FOUND');
    END IF;

    v_object_id := p_object_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'object_id', v_object_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
END;
$$;

-- 052 replacement of 043 delete_venue_layout_object_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.delete_venue_layout_object_atomic(
  p_venue_id uuid,
  p_object_id uuid,
  p_soft_only boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_layout_objects
    WHERE id = p_object_id
      AND venue_id = p_venue_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = p_object_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_VENUE_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_NOT_FOUND');
  END IF;

  IF p_soft_only THEN
    UPDATE public.venue_layout_objects
    SET is_visible = false,
        updated_at = now()
    WHERE id = p_object_id
      AND venue_id = p_venue_id;
  ELSE
    DELETE FROM public.venue_layout_objects
    WHERE id = p_object_id
      AND venue_id = p_venue_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'object_id', p_object_id,
    'soft_only', p_soft_only
  );
END;
$$;

-- 052 replacement of 043 save_venue_layout_batch_atomic: can_manage_venue + reject hidden/archived
CREATE OR REPLACE FUNCTION public.save_venue_layout_batch_atomic(
  p_venue_id uuid,
  p_canvas jsonb DEFAULT NULL,
  p_areas jsonb DEFAULT '[]'::jsonb,
  p_tables jsonb DEFAULT '[]'::jsonb,
  p_seats jsonb DEFAULT '[]'::jsonb,
  p_objects jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_layout_guard jsonb;
  v_item jsonb;
  v_result jsonb;
  v_total integer;
  v_area_id uuid;
  v_table_id uuid;
  v_seat_id uuid;
  v_object_id uuid;
  v_soft_only boolean;
  v_existing public.venue_tables%ROWTYPE;
  v_existing_seat public.venue_seats%ROWTYPE;
  v_area_error text;
BEGIN
  v_layout_guard := public.venue_layout_assert_writable(p_venue_id);
  IF v_layout_guard IS NOT NULL THEN
    RETURN v_layout_guard;
  END IF;

  v_total :=
    jsonb_array_length(COALESCE(p_areas, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_tables, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_seats, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_objects, '[]'::jsonb));

  IF v_total > 200 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'BATCH_LIMIT_EXCEEDED');
  END IF;

  IF p_canvas IS NOT NULL THEN
    v_result := public.update_venue_layout_canvas_atomic(
      p_venue_id,
      NULLIF(p_canvas->>'canvas_width', '')::numeric,
      NULLIF(p_canvas->>'canvas_height', '')::numeric,
      NULLIF(p_canvas->>'grid_size', '')::numeric
    );
    PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_areas, '[]'::jsonb))
  LOOP
    v_area_id := NULLIF(v_item->>'area_id', '')::uuid;

    IF v_area_id IS NULL THEN
      v_result := public.upsert_venue_area_atomic(
        p_venue_id,
        v_item->>'name',
        v_item->>'area_type',
        NULLIF(v_item->>'capacity', '')::integer,
        COALESCE(NULLIF(v_item->>'sort_order', '')::integer, 0),
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        NULL
      );
      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.venue_areas
        WHERE id = v_area_id
          AND venue_id = p_venue_id
      ) THEN
        IF EXISTS (SELECT 1 FROM public.venue_areas WHERE id = v_area_id) THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'AREA_VENUE_MISMATCH'
            USING ERRCODE = 'P0001';
        END IF;
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'AREA_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.venue_areas
      SET name = CASE
            WHEN v_item ? 'name' THEN v_item->>'name'
            ELSE name
          END,
          area_type = CASE
            WHEN v_item ? 'area_type' THEN NULLIF(v_item->>'area_type', '')
            ELSE area_type
          END,
          capacity = CASE
            WHEN v_item ? 'capacity' THEN NULLIF(v_item->>'capacity', '')::integer
            ELSE capacity
          END,
          sort_order = CASE
            WHEN v_item ? 'sort_order' THEN NULLIF(v_item->>'sort_order', '')::integer
            ELSE sort_order
          END,
          position_x = CASE
            WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
            ELSE position_x
          END,
          position_y = CASE
            WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
            ELSE position_y
          END,
          width = CASE
            WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
            ELSE width
          END,
          height = CASE
            WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
            ELSE height
          END,
          rotation = CASE
            WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
            ELSE rotation
          END,
          shape = CASE
            WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
            ELSE shape
          END
      WHERE id = v_area_id
        AND venue_id = p_venue_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_tables, '[]'::jsonb))
  LOOP
    v_table_id := NULLIF(v_item->>'table_id', '')::uuid;

    IF v_table_id IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.venue_tables
      WHERE id = v_table_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_existing.venue_id IS DISTINCT FROM p_venue_id THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_VENUE_MISMATCH'
          USING ERRCODE = 'P0001';
      END IF;

      IF NULLIF(v_item->>'area_id', '')::uuid IS NOT NULL THEN
        v_area_error := public.venue_layout_assert_area_belongs_to_venue(
          p_venue_id,
          NULLIF(v_item->>'area_id', '')::uuid
        );
        IF v_area_error IS NOT NULL THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', v_area_error
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF public.venue_layout_is_table_in_use(v_table_id) THEN
        IF (v_item ? 'table_number')
            AND v_item->>'table_number' IS DISTINCT FROM v_existing.table_number THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'capacity')
            AND NULLIF(v_item->>'capacity', '')::integer IS DISTINCT FROM v_existing.capacity THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'table_type')
            AND NULLIF(v_item->>'table_type', '') IS DISTINCT FROM v_existing.table_type THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      UPDATE public.venue_tables
      SET area_id = CASE
            WHEN v_item ? 'area_id' THEN NULLIF(v_item->>'area_id', '')::uuid
            ELSE area_id
          END,
          table_number = COALESCE(v_item->>'table_number', table_number),
          capacity = COALESCE(NULLIF(v_item->>'capacity', '')::integer, capacity),
          table_type = CASE
            WHEN v_item ? 'table_type' THEN NULLIF(v_item->>'table_type', '')
            ELSE table_type
          END,
          position_x = CASE
            WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
            ELSE position_x
          END,
          position_y = CASE
            WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
            ELSE position_y
          END,
          width = CASE
            WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
            ELSE width
          END,
          depth = CASE
            WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
            ELSE depth
          END,
          height = CASE
            WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
            ELSE height
          END,
          elevation = CASE
            WHEN v_item ? 'elevation' THEN NULLIF(v_item->>'elevation', '')::numeric
            ELSE elevation
          END,
          rotation = CASE
            WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
            ELSE rotation
          END,
          shape = CASE
            WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
            ELSE shape
          END
      WHERE id = v_table_id
        AND venue_id = p_venue_id;
    ELSE
      v_result := public.upsert_venue_table_atomic(
        p_venue_id,
        v_item->>'table_number',
        NULLIF(v_item->>'capacity', '')::integer,
        NULLIF(v_item->>'table_type', ''),
        NULLIF(v_item->>'area_id', '')::uuid,
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'depth', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'elevation', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        NULL
      );

      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_seats, '[]'::jsonb))
  LOOP
    v_seat_id := NULLIF(v_item->>'seat_id', '')::uuid;

    IF v_seat_id IS NOT NULL THEN
      SELECT * INTO v_existing_seat
      FROM public.venue_seats
      WHERE id = v_seat_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_existing_seat.venue_id IS DISTINCT FROM p_venue_id THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_VENUE_MISMATCH'
          USING ERRCODE = 'P0001';
      END IF;

      IF NULLIF(v_item->>'area_id', '')::uuid IS NOT NULL THEN
        v_area_error := public.venue_layout_assert_area_belongs_to_venue(
          p_venue_id,
          NULLIF(v_item->>'area_id', '')::uuid
        );
        IF v_area_error IS NOT NULL THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', v_area_error
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF public.venue_layout_is_seat_in_use(v_seat_id) THEN
        IF (v_item ? 'section')
            AND NULLIF(v_item->>'section', '') IS DISTINCT FROM v_existing_seat.section THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'row_label')
            AND NULLIF(v_item->>'row_label', '') IS DISTINCT FROM v_existing_seat.row_label THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'seat_number')
            AND v_item->>'seat_number' IS DISTINCT FROM v_existing_seat.seat_number THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'seat_type')
            AND NULLIF(v_item->>'seat_type', '') IS DISTINCT FROM v_existing_seat.seat_type THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      UPDATE public.venue_seats
      SET area_id = CASE
            WHEN v_item ? 'area_id' THEN NULLIF(v_item->>'area_id', '')::uuid
            ELSE area_id
          END,
          section = CASE
            WHEN v_item ? 'section' THEN NULLIF(v_item->>'section', '')
            ELSE section
          END,
          row_label = CASE
            WHEN v_item ? 'row_label' THEN NULLIF(v_item->>'row_label', '')
            ELSE row_label
          END,
          seat_number = COALESCE(v_item->>'seat_number', seat_number),
          seat_type = CASE
            WHEN v_item ? 'seat_type' THEN NULLIF(v_item->>'seat_type', '')
            ELSE seat_type
          END,
          position_x = CASE
            WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
            ELSE position_x
          END,
          position_y = CASE
            WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
            ELSE position_y
          END,
          width = CASE
            WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
            ELSE width
          END,
          depth = CASE
            WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
            ELSE depth
          END,
          height = CASE
            WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
            ELSE height
          END,
          rotation = CASE
            WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
            ELSE rotation
          END,
          shape = CASE
            WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
            ELSE shape
          END
      WHERE id = v_seat_id
        AND venue_id = p_venue_id;
    ELSE
      v_result := public.upsert_venue_seat_atomic(
        p_venue_id,
        v_item->>'seat_number',
        NULLIF(v_item->>'section', ''),
        NULLIF(v_item->>'row_label', ''),
        NULLIF(v_item->>'seat_type', ''),
        NULLIF(v_item->>'area_id', '')::uuid,
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'depth', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        NULL
      );

      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_objects, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'delete')::boolean, false) THEN
      v_object_id := NULLIF(v_item->>'object_id', '')::uuid;

      IF v_object_id IS NULL THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'OBJECT_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      v_soft_only := COALESCE((v_item->>'soft_only')::boolean, true);

      v_result := public.delete_venue_layout_object_atomic(
        p_venue_id,
        v_object_id,
        v_soft_only
      );

      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    ELSE
      v_object_id := NULLIF(v_item->>'object_id', '')::uuid;

      IF v_object_id IS NULL THEN
        v_result := public.upsert_venue_layout_object_atomic(
          p_venue_id,
          v_item->>'object_type',
          NULLIF(v_item->>'name', ''),
          NULLIF(v_item->>'area_id', '')::uuid,
          NULLIF(v_item->>'position_x', '')::numeric,
          NULLIF(v_item->>'position_y', '')::numeric,
          NULLIF(v_item->>'width', '')::numeric,
          NULLIF(v_item->>'depth', '')::numeric,
          NULLIF(v_item->>'height', '')::numeric,
          NULLIF(v_item->>'elevation', '')::numeric,
          NULLIF(v_item->>'rotation', '')::numeric,
          NULLIF(v_item->>'shape', ''),
          COALESCE(NULLIF(v_item->>'z_index', '')::integer, 0),
          COALESCE((v_item->>'is_visible')::boolean, true),
          NULL
        );

        PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
      ELSE
        IF NOT EXISTS (
          SELECT 1
          FROM public.venue_layout_objects
          WHERE id = v_object_id
            AND venue_id = p_venue_id
        ) THEN
          IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = v_object_id) THEN
            RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'OBJECT_VENUE_MISMATCH'
              USING ERRCODE = 'P0001';
          END IF;
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'OBJECT_NOT_FOUND'
            USING ERRCODE = 'P0001';
        END IF;

        IF (v_item ? 'area_id') AND NULLIF(v_item->>'area_id', '')::uuid IS NOT NULL THEN
          v_area_error := public.venue_layout_assert_area_belongs_to_venue(
            p_venue_id,
            NULLIF(v_item->>'area_id', '')::uuid
          );
          IF v_area_error IS NOT NULL THEN
            RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', v_area_error
              USING ERRCODE = 'P0001';
          END IF;
        END IF;

        UPDATE public.venue_layout_objects
        SET area_id = CASE
              WHEN v_item ? 'area_id' THEN NULLIF(v_item->>'area_id', '')::uuid
              ELSE area_id
            END,
            object_type = CASE
              WHEN v_item ? 'object_type' THEN NULLIF(v_item->>'object_type', '')
              ELSE object_type
            END,
            name = CASE
              WHEN v_item ? 'name' THEN NULLIF(v_item->>'name', '')
              ELSE name
            END,
            position_x = CASE
              WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
              ELSE position_x
            END,
            position_y = CASE
              WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
              ELSE position_y
            END,
            width = CASE
              WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
              ELSE width
            END,
            depth = CASE
              WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
              ELSE depth
            END,
            height = CASE
              WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
              ELSE height
            END,
            elevation = CASE
              WHEN v_item ? 'elevation' THEN NULLIF(v_item->>'elevation', '')::numeric
              ELSE elevation
            END,
            rotation = CASE
              WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
              ELSE rotation
            END,
            shape = CASE
              WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
              ELSE shape
            END,
            z_index = CASE
              WHEN v_item ? 'z_index' THEN NULLIF(v_item->>'z_index', '')::integer
              ELSE z_index
            END,
            is_visible = CASE
              WHEN v_item ? 'is_visible' THEN (v_item->>'is_visible')::boolean
              ELSE is_visible
            END,
            updated_at = now()
        WHERE id = v_object_id
          AND venue_id = p_venue_id;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'processed_count', v_total
  );
END;
$$;

COMMIT;
