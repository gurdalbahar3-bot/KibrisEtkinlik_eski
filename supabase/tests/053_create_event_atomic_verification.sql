-- 053 create_event_atomic — local/staging verification (NEVER production)
-- Run AFTER applying migration 053 on a non-production database.
-- Usage (local Supabase):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/053_create_event_atomic_verification.sql

\set ON_ERROR_STOP on

DELETE FROM public.admin_audit_log WHERE actor_id IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003',
  'a0530004-0004-4004-8004-000000000004',
  'a0530005-0005-4005-8005-000000000005',
  'a0530006-0006-4006-8006-000000000006',
  'a0530007-0007-4007-8007-000000000007',
  'a0530008-0008-4008-8008-000000000008'
) OR target_id IN (
  'e0530001-0001-4001-8001-000000000001'
);
DELETE FROM public.events WHERE owner_id IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003',
  'a0530004-0004-4004-8004-000000000004',
  'a0530005-0005-4005-8005-000000000005',
  'a0530006-0006-4006-8006-000000000006',
  'a0530007-0007-4007-8007-000000000007',
  'a0530008-0008-4008-8008-000000000008'
) OR created_by IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003'
) OR id = 'e0530001-0001-4001-8001-000000000001';
DELETE FROM public.venues WHERE id IN (
  'b0530001-0001-4001-8001-000000000001',
  'b0530002-0002-4002-8002-000000000002',
  'b0530003-0003-4003-8003-000000000003',
  'b0530004-0004-4004-8004-000000000004'
) OR owner_id IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003'
);
DELETE FROM public.organization_memberships WHERE profile_id IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003',
  'a0530004-0004-4004-8004-000000000004',
  'a0530005-0005-4005-8005-000000000005',
  'a0530006-0006-4006-8006-000000000006',
  'a0530007-0007-4007-8007-000000000007',
  'a0530008-0008-4008-8008-000000000008'
) OR organization_id IN (
  'c0530001-0001-4001-8001-000000000001',
  'c0530002-0002-4002-8002-000000000002'
);
DELETE FROM public.organizer_profiles WHERE profile_id IN (
  'a0530002-0002-4002-8002-000000000002',
  'a0530006-0006-4006-8006-000000000006',
  'a0530007-0007-4007-8007-000000000007'
);
DELETE FROM public.venue_owner_profiles WHERE profile_id IN (
  'a0530003-0003-4003-8003-000000000003',
  'a0530004-0004-4004-8004-000000000004'
);
DELETE FROM public.super_admin_profiles WHERE profile_id = 'a0530001-0001-4001-8001-000000000001';
DELETE FROM public.organizations WHERE id IN (
  'c0530001-0001-4001-8001-000000000001',
  'c0530002-0002-4002-8002-000000000002'
);
DELETE FROM public.profiles WHERE id IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003',
  'a0530004-0004-4004-8004-000000000004',
  'a0530005-0005-4005-8005-000000000005',
  'a0530006-0006-4006-8006-000000000006',
  'a0530007-0007-4007-8007-000000000007',
  'a0530008-0008-4008-8008-000000000008'
);
DELETE FROM auth.users WHERE id IN (
  'a0530001-0001-4001-8001-000000000001',
  'a0530002-0002-4002-8002-000000000002',
  'a0530003-0003-4003-8003-000000000003',
  'a0530004-0004-4004-8004-000000000004',
  'a0530005-0005-4005-8005-000000000005',
  'a0530006-0006-4006-8006-000000000006',
  'a0530007-0007-4007-8007-000000000007',
  'a0530008-0008-4008-8008-000000000008'
);

CREATE TEMP TABLE t053_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_sa uuid := 'a0530001-0001-4001-8001-000000000001';
  v_org_user uuid := 'a0530002-0002-4002-8002-000000000002';
  v_vo_user uuid := 'a0530003-0003-4003-8003-000000000003';
  v_unapproved uuid := 'a0530004-0004-4004-8004-000000000004';
  v_customer uuid := 'a0530005-0005-4005-8005-000000000005';
  v_org_admin uuid := 'a0530006-0006-4006-8006-000000000006';
  v_org_member uuid := 'a0530007-0007-4007-8007-000000000007';
  v_spider uuid := 'a0530008-0008-4008-8008-000000000008';
  v_org_id uuid := 'c0530001-0001-4001-8001-000000000001';
  v_org_inactive uuid := 'c0530002-0002-4002-8002-000000000002';
  v_venue_active uuid := 'b0530001-0001-4001-8001-000000000001';
  v_venue_hidden uuid := 'b0530002-0002-4002-8002-000000000002';
  v_venue_archived uuid := 'b0530003-0003-4003-8003-000000000003';
  v_venue_draft uuid := 'b0530004-0004-4004-8004-000000000004';
  v_published_id uuid := 'e0530001-0001-4001-8001-000000000001';
  v_instance uuid;
  v_role_owner uuid;
  v_role_admin uuid;
  v_role_member uuid;
  v_result jsonb;
  v_cnt int;
  v_cnt2 int;
  v_status text;
  v_owner uuid;
  v_created uuid;
  v_event_org uuid;
  v_event_vo uuid;
  v_event_sa uuid;
  v_event_status text;
  v_org_attached uuid;
  v_bool boolean;
  v_policy_def text;
  v_starts timestamptz := now() + interval '14 days';
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  SELECT id INTO v_role_owner FROM public.roles WHERE code = 'org_owner';
  SELECT id INTO v_role_admin FROM public.roles WHERE code = 'org_admin';
  SELECT id INTO v_role_member FROM public.roles WHERE code = 'org_member';

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_sa, v_instance, 'authenticated', 'authenticated', '053-sa@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_user, v_instance, 'authenticated', 'authenticated', '053-organizer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_vo_user, v_instance, 'authenticated', 'authenticated', '053-venue@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_unapproved, v_instance, 'authenticated', 'authenticated', '053-unapproved@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer, v_instance, 'authenticated', 'authenticated', '053-customer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_admin, v_instance, 'authenticated', 'authenticated', '053-org-admin@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_member, v_instance, 'authenticated', 'authenticated', '053-org-member@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_spider, v_instance, 'authenticated', 'authenticated', '053-spider@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_sa, '053-sa@staging.test', 'customer', 'not_required', '053 Super Admin'),
    (v_org_user, '053-organizer@staging.test', 'organizer', 'approved', '053 Organizer'),
    (v_vo_user, '053-venue@staging.test', 'venue_owner', 'approved', '053 Venue Owner'),
    (v_unapproved, '053-unapproved@staging.test', 'venue_owner', 'pending', '053 Unapproved VO'),
    (v_customer, '053-customer@staging.test', 'customer', 'not_required', '053 Customer'),
    (v_org_admin, '053-org-admin@staging.test', 'organizer', 'approved', '053 Org Admin'),
    (v_org_member, '053-org-member@staging.test', 'organizer', 'approved', '053 Org Member'),
    (v_spider, '053-spider@staging.test', 'customer', 'not_required', '053 Spider')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = EXCLUDED.account_type,
    verification_status = EXCLUDED.verification_status,
    full_name = EXCLUDED.full_name;

  INSERT INTO public.super_admin_profiles (profile_id) VALUES (v_sa);
  INSERT INTO public.organizer_profiles (profile_id, organization_name)
  VALUES
    (v_org_user, '053 Organizer Co'),
    (v_org_admin, '053 Org Admin Co'),
    (v_org_member, '053 Org Member Co');
  INSERT INTO public.venue_owner_profiles (profile_id, business_name)
  VALUES
    (v_vo_user, '053 Venue Biz'),
    (v_unapproved, '053 Unapproved Biz');

  INSERT INTO public.organizations (id, slug, name, status, created_from_profile_id)
  VALUES
    (v_org_id, '053-event-org', '053 Event Org', 'active', v_org_user),
    (v_org_inactive, '053-event-org-inactive', '053 Inactive Org', 'inactive', NULL);

  INSERT INTO public.organization_memberships (
    organization_id, profile_id, role_id, status, joined_at
  )
  VALUES
    (v_org_id, v_org_user, v_role_owner, 'active', now()),
    (v_org_id, v_org_admin, v_role_admin, 'active', now()),
    (v_org_id, v_org_member, v_role_member, 'active', now());

  INSERT INTO public.venues (id, owner_id, created_by, name, status)
  VALUES
    (v_venue_active, v_vo_user, v_vo_user, '053 Active Venue', 'active'),
    (v_venue_hidden, v_vo_user, v_vo_user, '053 Hidden Venue', 'hidden'),
    (v_venue_archived, v_vo_user, v_vo_user, '053 Archived Venue', 'archived'),
    (v_venue_draft, v_vo_user, v_vo_user, '053 Draft Venue', 'draft');

  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  )
  VALUES (
    v_published_id, v_org_user, v_org_user, v_venue_active,
    '053 Published Event', 'concert', 'published', now() + interval '7 days'
  );

  -- Schema
  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_event_atomic';
  INSERT INTO t053_report VALUES (
    'schema', 'create_event_atomic exists', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'event_owner_is_eligible';
  INSERT INTO t053_report VALUES (
    'schema', 'event_owner_is_eligible exists', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'events'
    AND a.attname = 'created_by' AND NOT a.attisdropped AND a.attnotnull;
  INSERT INTO t053_report VALUES (
    'schema', 'events.created_by NOT NULL', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('publish_event', 'postpone_event', 'reschedule_event');
  INSERT INTO t053_report VALUES (
    'schema', '034 publish/postpone/reschedule still present', '3', v_cnt::text,
    CASE WHEN v_cnt = 3 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_venue_atomic';
  INSERT INTO t053_report VALUES (
    'schema', '052 create_venue_atomic still present', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events'
    AND policyname = 'events_insert_owner_draft';
  INSERT INTO t053_report VALUES (
    'rls', 'events_insert_owner_draft dropped', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events'
    AND policyname IN (
      'events_select_public', 'events_select_owner', 'events_select_org_member',
      'events_update_owner_draft'
    );
  INSERT INTO t053_report VALUES (
    'rls', 'select + draft update policies kept', '4', v_cnt::text,
    CASE WHEN v_cnt = 4 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT pg_get_expr(c.polqual, c.polrelid) INTO v_policy_def
  FROM pg_policy c
  JOIN pg_class rel ON rel.oid = c.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'events'
    AND c.polname = 'events_select_public';
  INSERT INTO t053_report VALUES (
    'rls', 'events_select_public still published/postponed/completed', 'present',
    COALESCE(v_policy_def, 'MISSING'),
    CASE
      WHEN v_policy_def IS NOT NULL
       AND v_policy_def LIKE '%published%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  v_bool := has_table_privilege('authenticated', 'public.events', 'INSERT');
  INSERT INTO t053_report VALUES (
    'rls', 'authenticated INSERT revoked', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_table_privilege('anon', 'public.events', 'INSERT');
  INSERT INTO t053_report VALUES (
    'rls', 'anon INSERT revoked', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_column_privilege('authenticated', 'public.events', 'title', 'INSERT');
  INSERT INTO t053_report VALUES (
    'rls', 'authenticated column INSERT revoked', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_function_privilege(
    'authenticated',
    'public.create_event_atomic(text,uuid,text,timestamptz,text,timestamptz,text,boolean,boolean,uuid,uuid)',
    'execute'
  );
  INSERT INTO t053_report VALUES (
    'auth', 'authenticated can execute create_event_atomic', 'true', v_bool::text,
    CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_function_privilege(
    'anon',
    'public.create_event_atomic(text,uuid,text,timestamptz,text,timestamptz,text,boolean,boolean,uuid,uuid)',
    'execute'
  );
  INSERT INTO t053_report VALUES (
    'auth', 'anon cannot execute create_event_atomic', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  -- Approved organizer PASS (no org attached — do not silently default)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Organizer Event',
    v_venue_active,
    'concert',
    v_starts
  );
  EXECUTE 'RESET ROLE';
  v_event_org := NULLIF(v_result->>'event_id', '')::uuid;
  SELECT owner_id, created_by, status, organization_id
    INTO v_owner, v_created, v_status, v_org_attached
  FROM public.events WHERE id = v_event_org;
  INSERT INTO t053_report VALUES (
    'create', 'approved organizer PASS', 'true/draft',
    COALESCE(v_result->>'success', 'NULL') || '/' || COALESCE(v_status, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_status = 'draft' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t053_report VALUES (
    'create', 'organizer created_by/owner_id/status draft', 'self/self/draft',
    COALESCE(v_created::text, 'NULL') || '/' || COALESCE(v_owner::text, 'NULL') || '/' || COALESCE(v_status, 'NULL'),
    CASE
      WHEN v_created = v_org_user AND v_owner = v_org_user AND v_status = 'draft'
      THEN 'PASS' ELSE 'FAIL'
    END
  );
  INSERT INTO t053_report VALUES (
    'org', 'no silent default organization', 'null-org',
    COALESCE(v_org_attached::text, 'null-org'),
    CASE WHEN v_org_attached IS NULL THEN 'PASS' ELSE 'FAIL' END
  );

  -- Approved VO PASS without org
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_event_atomic(
    '053 VO Event',
    v_venue_active,
    'nightlife',
    v_starts
  );
  EXECUTE 'RESET ROLE';
  v_event_vo := NULLIF(v_result->>'event_id', '')::uuid;
  SELECT owner_id, created_by, status, organization_id
    INTO v_owner, v_created, v_status, v_org_attached
  FROM public.events WHERE id = v_event_vo;
  INSERT INTO t053_report VALUES (
    'create', 'approved VO PASS', 'true/draft/null-org',
    COALESCE(v_result->>'success', 'NULL') || '/' || COALESCE(v_status, 'NULL') || '/' || COALESCE(v_org_attached::text, 'null-org'),
    CASE
      WHEN v_result->>'success' = 'true'
       AND v_status = 'draft'
       AND v_owner = v_vo_user
       AND v_created = v_vo_user
       AND v_org_attached IS NULL
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  -- Unapproved FAIL
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_unapproved::text, true);
  v_result := public.create_event_atomic(
    '053 Unapproved Event', v_venue_active, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'create', 'unapproved FAIL', 'OWNER_NOT_ELIGIBLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_ELIGIBLE' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Customer FAIL
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  v_result := public.create_event_atomic(
    '053 Customer Event', v_venue_active, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'create', 'customer FAIL', 'OWNER_NOT_ELIGIBLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_ELIGIBLE' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Spider no write
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_spider::text, true);
  v_result := public.create_event_atomic(
    '053 Spider Event', v_venue_active, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'security', 'spider no write', 'OWNER_NOT_ELIGIBLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_ELIGIBLE' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname ILIKE '%spider%';
  INSERT INTO t053_report VALUES (
    'security', 'no spider write RPC', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA other-owner PASS
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.create_event_atomic(
    '053 SA For VO',
    v_venue_active,
    'festival',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_vo_user
  );
  EXECUTE 'RESET ROLE';
  v_event_sa := NULLIF(v_result->>'event_id', '')::uuid;
  SELECT owner_id, created_by, status
    INTO v_owner, v_created, v_status
  FROM public.events WHERE id = v_event_sa;
  INSERT INTO t053_report VALUES (
    'create', 'SA other-owner PASS', 'created_by=SA owner=VO draft',
    COALESCE(v_created::text, 'NULL') || '/' || COALESCE(v_owner::text, 'NULL') || '/' || COALESCE(v_status, 'NULL'),
    CASE
      WHEN v_result->>'success' = 'true'
       AND v_created = v_sa
       AND v_owner = v_vo_user
       AND v_status = 'draft'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  -- SA as owner FAIL
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.create_event_atomic(
    '053 SA Self',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_sa
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'create', 'SA as owner FAIL', 'SA_CANNOT_SELF_OWN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'SA_CANNOT_SELF_OWN' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.create_event_atomic(
    '053 SA Missing Owner', v_venue_active, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'create', 'SA owner required', 'OWNER_REQUIRED',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_REQUIRED' THEN 'PASS' ELSE 'FAIL' END
  );

  -- VO cannot assign another owner
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_event_atomic(
    '053 VO Other Owner',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_org_user
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'create', 'VO cannot assign other owner', 'OWNER_NOT_SELF',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_SELF' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Active venue PASS already covered; hidden / archived FAIL
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Hidden Venue Event', v_venue_hidden, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'venue', 'hidden FAIL', 'VENUE_NOT_ACTIVE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_ACTIVE' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Archived Venue Event', v_venue_archived, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'venue', 'archived FAIL', 'VENUE_NOT_ACTIVE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_ACTIVE' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Draft Venue Event', v_venue_draft, 'concert', v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'venue', 'draft venue FAIL', 'VENUE_NOT_ACTIVE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_ACTIVE' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Missing Venue Event',
    'b053ffff-0001-4001-8001-000000000001',
    'concert',
    v_starts
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'venue', 'missing venue FAIL', 'VENUE_NOT_FOUND',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_FOUND' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Org access PASS (organizer owner)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Org Attached Event',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_org_user,
    v_org_id
  );
  EXECUTE 'RESET ROLE';
  SELECT organization_id INTO v_org_attached
  FROM public.events WHERE id = NULLIF(v_result->>'event_id', '')::uuid;
  INSERT INTO t053_report VALUES (
    'org', 'org access PASS', 'true/org',
    COALESCE(v_result->>'success', 'NULL') || '/' || COALESCE(v_org_attached::text, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_org_attached = v_org_id THEN 'PASS' ELSE 'FAIL' END
  );

  -- Org admin PASS
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_admin::text, true);
  v_result := public.create_event_atomic(
    '053 Org Admin Event',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_org_admin,
    v_org_id
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'org', 'org admin attach PASS', 'true',
    COALESCE(v_result->>'success', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Org member FAIL
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_member::text, true);
  v_result := public.create_event_atomic(
    '053 Org Member Event',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_org_member,
    v_org_id
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'org', 'org member attach FAIL', 'ORGANIZATION_FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'ORGANIZATION_FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- VO cannot attach unmanaged org
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_event_atomic(
    '053 VO Stolen Org',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_vo_user,
    v_org_id
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'org', 'org access FAIL (VO unmanaged)', 'ORGANIZATION_FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'ORGANIZATION_FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Missing Org',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_org_user,
    'c053ffff-0001-4001-8001-000000000001'
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'org', 'missing org FAIL', 'ORGANIZATION_NOT_FOUND',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'ORGANIZATION_NOT_FOUND' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_event_atomic(
    '053 Inactive Org',
    v_venue_active,
    'concert',
    v_starts,
    NULL, NULL, NULL, false, false,
    v_org_user,
    v_org_inactive
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'org', 'inactive org FAIL', 'ORGANIZATION_INACTIVE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'ORGANIZATION_INACTIVE' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Draft not in public SELECT
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_org;
  SELECT count(*) INTO v_cnt2 FROM public.events WHERE id = v_published_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO t053_report VALUES (
    'public', 'draft not in public SELECT', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t053_report VALUES (
    'public', 'published still in public SELECT', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Existing published events unchanged
  SELECT status INTO v_event_status FROM public.events WHERE id = v_published_id;
  INSERT INTO t053_report VALUES (
    'events', 'existing published events unchanged', 'published',
    COALESCE(v_event_status, 'NULL'),
    CASE WHEN v_event_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Client INSERT FAIL
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
    INSERT INTO public.events (
      id, owner_id, created_by, venue_id, title, category, status, starts_at
    )
    VALUES (
      'e053ffff-0001-4001-8001-000000000001',
      v_org_user, v_org_user, v_venue_active,
      'direct insert', 'concert', 'draft', v_starts
    );
    EXECUTE 'RESET ROLE';
    INSERT INTO t053_report VALUES (
      'rls', 'client INSERT FAIL', 'denied', 'inserted', 'FAIL'
    );
    DELETE FROM public.events WHERE id = 'e053ffff-0001-4001-8001-000000000001';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t053_report VALUES (
      'rls', 'client INSERT FAIL', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Audit
  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_CREATED'
    AND target_type = 'event'
    AND target_id = v_event_org
    AND actor_id = v_org_user
    AND old_state IS NULL
    AND new_state ->> 'status' = 'draft';
  INSERT INTO t053_report VALUES (
    'audit', 'EVENT_CREATED written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_sa, 'EVENT_CREATED', 'event', v_event_vo);
    EXECUTE 'RESET ROLE';
    INSERT INTO t053_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t053_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Cleanup
  DELETE FROM public.admin_audit_log
  WHERE actor_id IN (v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider)
     OR target_id IN (v_event_org, v_event_vo, v_event_sa, v_published_id);
  DELETE FROM public.events
  WHERE owner_id IN (v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider)
     OR created_by IN (v_sa, v_org_user, v_vo_user, v_org_admin)
     OR id = v_published_id;
  DELETE FROM public.venues
  WHERE id IN (v_venue_active, v_venue_hidden, v_venue_archived, v_venue_draft);
  DELETE FROM public.organization_memberships WHERE organization_id IN (v_org_id, v_org_inactive);
  DELETE FROM public.organizer_profiles WHERE profile_id IN (v_org_user, v_org_admin, v_org_member);
  DELETE FROM public.venue_owner_profiles WHERE profile_id IN (v_vo_user, v_unapproved);
  DELETE FROM public.super_admin_profiles WHERE profile_id = v_sa;
  DELETE FROM public.organizations WHERE id IN (v_org_id, v_org_inactive);
  DELETE FROM public.profiles WHERE id IN (
    v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider
  );
  DELETE FROM auth.users WHERE id IN (
    v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider
  );
END $$;

SELECT section, test_name, expected, actual, result
FROM t053_report
ORDER BY section, test_name;
