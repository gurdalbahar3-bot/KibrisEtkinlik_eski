-- Migration 048 — Organizations Foundation
-- Scope: organizations, organization_memberships, staged nullable org FKs, idempotent backfill.
-- Auth: can_access_organization, can_manage_organization; extends can_manage_event (additive).
-- Depends on: 001–047 applied.
-- Does NOT modify: migrations 001–047, existing owner_id columns, existing event/venue SELECT policies.

BEGIN;

-- ============================================================
-- §1 Organization-scoped roles (idempotent seed)
-- ============================================================

INSERT INTO public.roles (code, name, description)
VALUES
  (
    'org_owner',
    'Organization Owner',
    'Full organization ownership; tenant administration.'
  ),
  (
    'org_admin',
    'Organization Admin',
    'Organization administration without ownership transfer.'
  ),
  (
    'org_member',
    'Organization Member',
    'Standard organization membership.'
  )
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- §2 Core tables
-- ============================================================

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_from_profile_id uuid NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug),
  CONSTRAINT organizations_created_from_profile_id_unique UNIQUE (created_from_profile_id),
  CONSTRAINT organizations_status_check CHECK (
    status IN ('active', 'inactive', 'suspended')
  )
);

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  profile_id uuid NOT NULL REFERENCES public.profiles (id),
  role_id uuid NOT NULL REFERENCES public.roles (id),
  status text NOT NULL DEFAULT 'active',
  invited_by uuid NULL REFERENCES public.profiles (id),
  joined_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_org_profile_unique
    UNIQUE (organization_id, profile_id),
  CONSTRAINT organization_memberships_status_check CHECK (
    status IN ('active', 'inactive', 'invited')
  )
);

CREATE INDEX organizations_status_idx
  ON public.organizations (status);

CREATE INDEX organizations_slug_idx
  ON public.organizations (slug);

CREATE INDEX organization_memberships_organization_id_idx
  ON public.organization_memberships (organization_id);

CREATE INDEX organization_memberships_profile_id_idx
  ON public.organization_memberships (profile_id);

CREATE INDEX organization_memberships_org_status_idx
  ON public.organization_memberships (organization_id, status)
  WHERE status = 'active';

-- ============================================================
-- §3 Nullable organization FK on existing entities
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN organization_id uuid NULL REFERENCES public.organizations (id);

ALTER TABLE public.venues
  ADD COLUMN organization_id uuid NULL REFERENCES public.organizations (id);

ALTER TABLE public.organizer_profiles
  ADD COLUMN organization_id uuid NULL REFERENCES public.organizations (id);

CREATE INDEX events_organization_id_idx
  ON public.events (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX venues_organization_id_idx
  ON public.venues (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX organizer_profiles_organization_id_idx
  ON public.organizer_profiles (organization_id)
  WHERE organization_id IS NOT NULL;

-- ============================================================
-- §4 Auth helpers (additive; existing helpers preserved)
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_organization(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.organization_memberships AS om
      WHERE om.organization_id = p_organization_id
        AND om.profile_id = auth.uid()
        AND om.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_organization(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.organization_memberships AS om
      JOIN public.roles AS r
        ON r.id = om.role_id
      WHERE om.organization_id = p_organization_id
        AND om.profile_id = auth.uid()
        AND om.status = 'active'
        AND r.code IN ('org_owner', 'org_admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.organization_slug_for_profile(p_profile_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'owner-' || p_profile_id::text;
$$;

-- Extend can_manage_event: org_owner/org_admin on linked organization (additive OR branch).
CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.owns_event(p_event_id)
      OR public.is_super_admin()
      OR public.has_event_staff_role(p_event_id, ARRAY['admin', 'event'])
      OR EXISTS (
        SELECT 1
        FROM public.events AS e
        JOIN public.organization_memberships AS om
          ON om.organization_id = e.organization_id
        JOIN public.roles AS r
          ON r.id = om.role_id
        WHERE e.id = p_event_id
          AND e.organization_id IS NOT NULL
          AND om.profile_id = auth.uid()
          AND om.status = 'active'
          AND r.code IN ('org_owner', 'org_admin')
      );
$$;

REVOKE ALL ON FUNCTION public.can_access_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organization_slug_for_profile(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organization(uuid) TO authenticated;

-- ============================================================
-- §5 RLS — organization tables
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_memberships TO authenticated;

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.can_access_organization(id)
  );

CREATE POLICY organization_memberships_select_scoped ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR profile_id = auth.uid()
    OR public.can_manage_organization(organization_id)
  );

-- Additive event read for active org members (draft/unpublished within own org only).
CREATE POLICY events_select_org_member ON public.events
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.can_access_organization(organization_id)
  );

-- Additive venue read for active org members.
CREATE POLICY venues_select_org_member ON public.venues
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.can_access_organization(organization_id)
  );

-- ============================================================
-- §6 Idempotent backfill — one organization per legacy owner profile
-- ============================================================

INSERT INTO public.organizations (
  slug,
  name,
  status,
  created_from_profile_id,
  created_at,
  updated_at
)
SELECT
  public.organization_slug_for_profile(op.profile_id),
  COALESCE(
    orgp.organization_name,
    vop.business_name,
    p.full_name,
    p.email,
    'Organization'
  ),
  'active',
  op.profile_id,
  now(),
  now()
FROM (
  SELECT DISTINCT owner_id AS profile_id
  FROM public.events
  UNION
  SELECT DISTINCT owner_id AS profile_id
  FROM public.venues
  UNION
  SELECT profile_id
  FROM public.organizer_profiles
  UNION
  SELECT profile_id
  FROM public.venue_owner_profiles
) AS op
JOIN public.profiles AS p
  ON p.id = op.profile_id
LEFT JOIN public.organizer_profiles AS orgp
  ON orgp.profile_id = op.profile_id
LEFT JOIN public.venue_owner_profiles AS vop
  ON vop.profile_id = op.profile_id
ON CONFLICT (created_from_profile_id) DO NOTHING;

INSERT INTO public.organization_memberships (
  organization_id,
  profile_id,
  role_id,
  status,
  joined_at,
  created_at
)
SELECT
  o.id,
  o.created_from_profile_id,
  r.id,
  'active',
  now(),
  now()
FROM public.organizations AS o
JOIN public.roles AS r
  ON r.code = 'org_owner'
WHERE o.created_from_profile_id IS NOT NULL
ON CONFLICT (organization_id, profile_id) DO NOTHING;

UPDATE public.events AS e
SET organization_id = o.id
FROM public.organizations AS o
WHERE e.organization_id IS NULL
  AND o.created_from_profile_id = e.owner_id;

UPDATE public.venues AS v
SET organization_id = o.id
FROM public.organizations AS o
WHERE v.organization_id IS NULL
  AND o.created_from_profile_id = v.owner_id;

UPDATE public.organizer_profiles AS op
SET organization_id = o.id
FROM public.organizations AS o
WHERE op.organization_id IS NULL
  AND o.created_from_profile_id = op.profile_id;

-- ============================================================
-- §7 Public RPCs — org management (RPC-only mutations)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_organization_atomic(
  p_name text,
  p_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_slug text := COALESCE(NULLIF(trim(p_slug), ''), public.organization_slug_for_profile(v_user_id));
  v_org_id uuid;
  v_owner_role_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE code = 'org_owner';

  IF v_owner_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORG_OWNER_ROLE_MISSING');
  END IF;

  INSERT INTO public.organizations (slug, name, status, created_from_profile_id)
  VALUES (v_slug, trim(p_name), 'active', v_user_id)
  ON CONFLICT (created_from_profile_id) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = now()
  RETURNING id INTO v_org_id;

  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE created_from_profile_id = v_user_id;
  END IF;

  INSERT INTO public.organization_memberships (
    organization_id, profile_id, role_id, status, joined_at
  )
  VALUES (v_org_id, v_user_id, v_owner_role_id, 'active', now())
  ON CONFLICT (organization_id, profile_id) DO UPDATE
    SET status = 'active',
        role_id = EXCLUDED.role_id,
        joined_at = COALESCE(public.organization_memberships.joined_at, now());

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'slug', v_slug
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SLUG_ALREADY_EXISTS');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_atomic(
  p_organization_id uuid,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_organization(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED');
  END IF;

  UPDATE public.organizations AS o
  SET
    name = COALESCE(NULLIF(trim(p_name), ''), o.name),
    slug = COALESCE(NULLIF(trim(p_slug), ''), o.slug),
    status = COALESCE(p_status, o.status),
    updated_at = now()
  WHERE o.id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORGANIZATION_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true, 'organization_id', p_organization_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SLUG_ALREADY_EXISTS');
END;
$$;

CREATE OR REPLACE FUNCTION public.add_organization_member_atomic(
  p_organization_id uuid,
  p_profile_id uuid,
  p_role_code text DEFAULT 'org_member'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_organization(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED');
  END IF;

  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROFILE_REQUIRED');
  END IF;

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE code = p_role_code;

  IF v_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROLE_NOT_FOUND');
  END IF;

  IF p_role_code = 'org_owner'
     AND NOT public.is_super_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_memberships AS om
       JOIN public.roles AS r ON r.id = om.role_id
       WHERE om.organization_id = p_organization_id
         AND om.profile_id = v_user_id
         AND om.status = 'active'
         AND r.code = 'org_owner'
     ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORG_OWNER_ASSIGN_FORBIDDEN');
  END IF;

  INSERT INTO public.organization_memberships (
    organization_id, profile_id, role_id, status, invited_by, joined_at
  )
  VALUES (
    p_organization_id, p_profile_id, v_role_id, 'active', v_user_id, now()
  )
  ON CONFLICT (organization_id, profile_id) DO UPDATE
    SET role_id = EXCLUDED.role_id,
        status = 'active',
        invited_by = EXCLUDED.invited_by,
        joined_at = COALESCE(public.organization_memberships.joined_at, now());

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'profile_id', p_profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_organization_member_atomic(
  p_organization_id uuid,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_organization(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED');
  END IF;

  SELECT r.code INTO v_target_role
  FROM public.organization_memberships AS om
  JOIN public.roles AS r ON r.id = om.role_id
  WHERE om.organization_id = p_organization_id
    AND om.profile_id = p_profile_id
    AND om.status = 'active';

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'MEMBERSHIP_NOT_FOUND');
  END IF;

  IF v_target_role = 'org_owner' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORG_OWNER_DEACTIVATE_FORBIDDEN');
  END IF;

  UPDATE public.organization_memberships AS om
  SET status = 'inactive'
  WHERE om.organization_id = p_organization_id
    AND om.profile_id = p_profile_id
    AND om.status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'profile_id', p_profile_id
  );
END;
$$;

-- ============================================================
-- §8 REVOKE / GRANT — RPCs
-- ============================================================

REVOKE ALL ON FUNCTION public.create_organization_atomic(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_atomic(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_organization_member_atomic(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_organization_member_atomic(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_organization_atomic(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_atomic(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_organization_member_atomic(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_organization_member_atomic(uuid, uuid) TO authenticated;

COMMIT;

-- ============================================================
-- §9 Post-apply verification queries (run manually after apply)
-- ============================================================
-- SELECT count(*) AS organizations_count FROM public.organizations;
-- SELECT count(*) AS memberships_count FROM public.organization_memberships;
-- SELECT count(*) AS events_linked FROM public.events WHERE organization_id IS NOT NULL;
-- SELECT count(*) AS venues_linked FROM public.venues WHERE organization_id IS NOT NULL;
-- SELECT count(*) AS organizer_profiles_linked FROM public.organizer_profiles WHERE organization_id IS NOT NULL;
-- SELECT count(*) AS orphan_event_org_refs FROM public.events e LEFT JOIN public.organizations o ON o.id = e.organization_id WHERE e.organization_id IS NOT NULL AND o.id IS NULL;
-- SELECT count(*) AS duplicate_owner_orgs FROM (SELECT created_from_profile_id, count(*) FROM public.organizations WHERE created_from_profile_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d;
-- SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND relname IN ('organizations', 'organization_memberships');
-- SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('organizations', 'organization_memberships', 'events', 'venues');
