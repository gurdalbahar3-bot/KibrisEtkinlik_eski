-- 048 Organizations Foundation — local/test verification harness
-- Run AFTER applying migration 048 on a non-production database.
-- Usage (local Supabase):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/048_organizations_foundation_verification.sql

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================
-- §1 Baseline counts
-- ============================================================

DO $$
DECLARE
  v_orgs bigint;
  v_memberships bigint;
  v_events_linked bigint;
  v_venues_linked bigint;
  v_profiles_linked bigint;
BEGIN
  SELECT count(*) INTO v_orgs FROM public.organizations;
  SELECT count(*) INTO v_memberships FROM public.organization_memberships;
  SELECT count(*) INTO v_events_linked FROM public.events WHERE organization_id IS NOT NULL;
  SELECT count(*) INTO v_venues_linked FROM public.venues WHERE organization_id IS NOT NULL;
  SELECT count(*) INTO v_profiles_linked FROM public.organizer_profiles WHERE organization_id IS NOT NULL;

  RAISE NOTICE 'organizations: %', v_orgs;
  RAISE NOTICE 'memberships: %', v_memberships;
  RAISE NOTICE 'events linked: %', v_events_linked;
  RAISE NOTICE 'venues linked: %', v_venues_linked;
  RAISE NOTICE 'organizer_profiles linked: %', v_profiles_linked;
END $$;

-- ============================================================
-- §2 Integrity checks (must be zero)
-- ============================================================

SELECT 'orphan_event_org_refs' AS check_name, count(*) AS failures
FROM public.events AS e
LEFT JOIN public.organizations AS o ON o.id = e.organization_id
WHERE e.organization_id IS NOT NULL AND o.id IS NULL;

SELECT 'orphan_venue_org_refs' AS check_name, count(*) AS failures
FROM public.venues AS v
LEFT JOIN public.organizations AS o ON o.id = v.organization_id
WHERE v.organization_id IS NOT NULL AND o.id IS NULL;

SELECT 'duplicate_owner_orgs' AS check_name, count(*) AS failures
FROM (
  SELECT created_from_profile_id
  FROM public.organizations
  WHERE created_from_profile_id IS NOT NULL
  GROUP BY 1
  HAVING count(*) > 1
) AS d;

SELECT 'events_owner_without_org' AS check_name, count(*) AS failures
FROM public.events AS e
WHERE e.organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.created_from_profile_id = e.owner_id
  );

SELECT 'venues_owner_without_org' AS check_name, count(*) AS failures
FROM public.venues AS v
WHERE v.organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.created_from_profile_id = v.owner_id
  );

-- ============================================================
-- §3 RLS enabled
-- ============================================================

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('organizations', 'organization_memberships');

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'organization_memberships', 'events', 'venues')
ORDER BY tablename, policyname;

-- ============================================================
-- §4 Cross-tenant simulation (requires auth.users + profiles seed)
-- ============================================================
-- Manual step: create User A / User B, orgs, events; set JWT claims or use SET LOCAL role.
-- Example negative assertion pattern:
--
-- SET LOCAL request.jwt.claim.sub = '<user_a_uuid>';
-- SELECT count(*) FROM organizations WHERE id = '<org_b_uuid>';  -- expect 0
-- RESET ALL;

ROLLBACK;
