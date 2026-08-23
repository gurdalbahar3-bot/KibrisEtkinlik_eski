-- 052 Venue Create + Lifecycle — local/staging verification (NEVER production)
-- Run AFTER applying migration 052 on a non-production database.
-- Usage (local Supabase):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/052_venue_create_lifecycle_verification.sql

\set ON_ERROR_STOP on

DELETE FROM public.admin_audit_log WHERE actor_id IN (
  'a0520001-0001-4001-8001-000000000001',
  'a0520002-0002-4002-8002-000000000002',
  'a0520003-0003-4003-8003-000000000003',
  'a0520004-0004-4004-8004-000000000004',
  'a0520005-0005-4005-8005-000000000005',
  'a0520006-0006-4006-8006-000000000006',
  'a0520007-0007-4007-8007-000000000007',
  'a0520008-0008-4008-8008-000000000008'
) OR target_id IN (
  'e0520001-0001-4001-8001-000000000001'
);
DELETE FROM public.events WHERE id = 'e0520001-0001-4001-8001-000000000001';
DELETE FROM public.venue_areas WHERE venue_id IN (
  SELECT id FROM public.venues WHERE owner_id IN (
    'a0520001-0001-4001-8001-000000000001',
    'a0520002-0002-4002-8002-000000000002',
    'a0520003-0003-4003-8003-000000000003',
    'a0520004-0004-4004-8004-000000000004',
    'a0520005-0005-4005-8005-000000000005',
    'a0520006-0006-4006-8006-000000000006',
    'a0520007-0007-4007-8007-000000000007',
    'a0520008-0008-4008-8008-000000000008'
  ) OR created_by IN (
    'a0520001-0001-4001-8001-000000000001',
    'a0520002-0002-4002-8002-000000000002',
    'a0520003-0003-4003-8003-000000000003'
  )
);
DELETE FROM public.venues WHERE owner_id IN (
  'a0520001-0001-4001-8001-000000000001',
  'a0520002-0002-4002-8002-000000000002',
  'a0520003-0003-4003-8003-000000000003',
  'a0520004-0004-4004-8004-000000000004',
  'a0520005-0005-4005-8005-000000000005',
  'a0520006-0006-4006-8006-000000000006',
  'a0520007-0007-4007-8007-000000000007',
  'a0520008-0008-4008-8008-000000000008'
) OR created_by IN (
  'a0520001-0001-4001-8001-000000000001',
  'a0520002-0002-4002-8002-000000000002',
  'a0520003-0003-4003-8003-000000000003'
);
DELETE FROM public.organization_memberships WHERE profile_id IN (
  'a0520001-0001-4001-8001-000000000001',
  'a0520002-0002-4002-8002-000000000002',
  'a0520003-0003-4003-8003-000000000003',
  'a0520004-0004-4004-8004-000000000004',
  'a0520005-0005-4005-8005-000000000005',
  'a0520006-0006-4006-8006-000000000006',
  'a0520007-0007-4007-8007-000000000007',
  'a0520008-0008-4008-8008-000000000008'
) OR organization_id = 'c0520001-0001-4001-8001-000000000001';
DELETE FROM public.organizer_profiles WHERE profile_id IN (
  'a0520002-0002-4002-8002-000000000002',
  'a0520006-0006-4006-8006-000000000006',
  'a0520007-0007-4007-8007-000000000007'
);
DELETE FROM public.venue_owner_profiles WHERE profile_id IN (
  'a0520003-0003-4003-8003-000000000003',
  'a0520004-0004-4004-8004-000000000004'
);
DELETE FROM public.super_admin_profiles WHERE profile_id = 'a0520001-0001-4001-8001-000000000001';
DELETE FROM public.organizations WHERE id = 'c0520001-0001-4001-8001-000000000001';
DELETE FROM public.profiles WHERE id IN (
  'a0520001-0001-4001-8001-000000000001',
  'a0520002-0002-4002-8002-000000000002',
  'a0520003-0003-4003-8003-000000000003',
  'a0520004-0004-4004-8004-000000000004',
  'a0520005-0005-4005-8005-000000000005',
  'a0520006-0006-4006-8006-000000000006',
  'a0520007-0007-4007-8007-000000000007',
  'a0520008-0008-4008-8008-000000000008'
);
DELETE FROM auth.users WHERE id IN (
  'a0520001-0001-4001-8001-000000000001',
  'a0520002-0002-4002-8002-000000000002',
  'a0520003-0003-4003-8003-000000000003',
  'a0520004-0004-4004-8004-000000000004',
  'a0520005-0005-4005-8005-000000000005',
  'a0520006-0006-4006-8006-000000000006',
  'a0520007-0007-4007-8007-000000000007',
  'a0520008-0008-4008-8008-000000000008'
);

CREATE TEMP TABLE t052_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_sa uuid := 'a0520001-0001-4001-8001-000000000001';
  v_org_user uuid := 'a0520002-0002-4002-8002-000000000002';
  v_vo_user uuid := 'a0520003-0003-4003-8003-000000000003';
  v_unapproved uuid := 'a0520004-0004-4004-8004-000000000004';
  v_customer uuid := 'a0520005-0005-4005-8005-000000000005';
  v_org_admin uuid := 'a0520006-0006-4006-8006-000000000006';
  v_org_member uuid := 'a0520007-0007-4007-8007-000000000007';
  v_spider uuid := 'a0520008-0008-4008-8008-000000000008';
  v_org_id uuid := 'c0520001-0001-4001-8001-000000000001';
  v_event_id uuid := 'e0520001-0001-4001-8001-000000000001';
  v_instance uuid;
  v_role_owner uuid;
  v_role_admin uuid;
  v_role_member uuid;
  v_district uuid;
  v_inactive_district uuid;
  v_result jsonb;
  v_cnt int;
  v_cnt2 int;
  v_status text;
  v_owner uuid;
  v_created uuid;
  v_venue_org uuid;
  v_venue_vo uuid;
  v_venue_sa uuid;
  v_venue_life uuid;
  v_venue_hide uuid;
  v_venue_arch uuid;
  v_default text;
  v_check text;
  v_bool boolean;
  v_policy_def text;
  v_event_status text;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  SELECT id INTO v_role_owner FROM public.roles WHERE code = 'org_owner';
  SELECT id INTO v_role_admin FROM public.roles WHERE code = 'org_admin';
  SELECT id INTO v_role_member FROM public.roles WHERE code = 'org_member';
  SELECT id INTO v_district FROM public.kktc_districts WHERE code = 'girne' AND is_active;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_sa, v_instance, 'authenticated', 'authenticated', '052-sa@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_user, v_instance, 'authenticated', 'authenticated', '052-organizer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_vo_user, v_instance, 'authenticated', 'authenticated', '052-venue@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_unapproved, v_instance, 'authenticated', 'authenticated', '052-unapproved@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer, v_instance, 'authenticated', 'authenticated', '052-customer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_admin, v_instance, 'authenticated', 'authenticated', '052-org-admin@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_member, v_instance, 'authenticated', 'authenticated', '052-org-member@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_spider, v_instance, 'authenticated', 'authenticated', '052-spider@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_sa, '052-sa@staging.test', 'customer', 'not_required', '052 Super Admin'),
    (v_org_user, '052-organizer@staging.test', 'organizer', 'approved', '052 Organizer'),
    (v_vo_user, '052-venue@staging.test', 'venue_owner', 'approved', '052 Venue Owner'),
    (v_unapproved, '052-unapproved@staging.test', 'venue_owner', 'pending', '052 Unapproved VO'),
    (v_customer, '052-customer@staging.test', 'customer', 'not_required', '052 Customer'),
    (v_org_admin, '052-org-admin@staging.test', 'organizer', 'approved', '052 Org Admin'),
    (v_org_member, '052-org-member@staging.test', 'organizer', 'approved', '052 Org Member'),
    (v_spider, '052-spider@staging.test', 'customer', 'not_required', '052 Spider')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = EXCLUDED.account_type,
    verification_status = EXCLUDED.verification_status,
    full_name = EXCLUDED.full_name;

  INSERT INTO public.super_admin_profiles (profile_id) VALUES (v_sa);
  INSERT INTO public.organizer_profiles (profile_id, organization_name)
  VALUES
    (v_org_user, '052 Organizer Co'),
    (v_org_admin, '052 Org Admin Co'),
    (v_org_member, '052 Org Member Co');
  INSERT INTO public.venue_owner_profiles (profile_id, business_name)
  VALUES
    (v_vo_user, '052 Venue Biz'),
    (v_unapproved, '052 Unapproved Biz');

  INSERT INTO public.organizations (id, slug, name, status, created_from_profile_id)
  VALUES (v_org_id, '052-venue-org', '052 Venue Org', 'active', v_org_user);

  INSERT INTO public.organization_memberships (
    organization_id, profile_id, role_id, status, joined_at
  )
  VALUES
    (v_org_id, v_org_user, v_role_owner, 'active', now()),
    (v_org_id, v_org_admin, v_role_admin, 'active', now()),
    (v_org_id, v_org_member, v_role_member, 'active', now());

  -- Schema
  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_venue_atomic';
  INSERT INTO t052_report VALUES (
    'schema', 'create_venue_atomic exists', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'submit_venue_for_review', 'approve_venue', 'hide_venue',
      'unhide_venue', 'archive_venue', 'can_manage_venue', 'update_venue_atomic'
    );
  INSERT INTO t052_report VALUES (
    'schema', 'lifecycle RPCs exist', '7', v_cnt::text,
    CASE WHEN v_cnt = 7 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'create_event%';
  INSERT INTO t052_report VALUES (
    'schema', 'no create_event* RPC', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'approve_account_application';
  INSERT INTO t052_report VALUES (
    'schema', '051 approve_account_application still present', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_default
  FROM pg_attrdef d
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  JOIN pg_class c ON c.oid = d.adrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'venues' AND a.attname = 'status';
  INSERT INTO t052_report VALUES (
    'backfill', 'new-row status default is draft', 'draft',
    COALESCE(v_default, 'NULL'),
    CASE WHEN v_default LIKE '%draft%' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT pg_get_constraintdef(c.oid) INTO v_check
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'venues' AND c.conname = 'venues_status_check';
  INSERT INTO t052_report VALUES (
    'backfill', 'status CHECK has lifecycle values and no inactive',
    'draft/in_review/active/hidden/archived',
    COALESCE(v_check, 'NULL'),
    CASE
      WHEN v_check LIKE '%draft%'
       AND v_check LIKE '%in_review%'
       AND v_check LIKE '%active%'
       AND v_check LIKE '%hidden%'
       AND v_check LIKE '%archived%'
       AND v_check NOT LIKE '%inactive%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  SELECT count(*) INTO v_cnt FROM public.venues WHERE status = 'inactive';
  INSERT INTO t052_report VALUES (
    'backfill', 'zero inactive rows after backfill', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  BEGIN
    INSERT INTO public.venues (id, owner_id, created_by, name, status)
    VALUES (
      'f0520001-0001-4001-8001-000000000001',
      v_vo_user, v_vo_user, '052 inactive should fail', 'inactive'
    );
    INSERT INTO t052_report VALUES (
      'backfill', 'cannot insert status=inactive', 'denied', 'inserted', 'FAIL'
    );
    DELETE FROM public.venues WHERE id = 'f0520001-0001-4001-8001-000000000001';
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t052_report VALUES (
      'backfill', 'cannot insert status=inactive', 'denied', SQLERRM, 'PASS'
    );
  END;

  SELECT pg_get_expr(c.polqual, c.polrelid) INTO v_policy_def
  FROM pg_policy c
  JOIN pg_class rel ON rel.oid = c.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'venues'
    AND c.polname = 'venues_select_public';
  INSERT INTO t052_report VALUES (
    'rls', 'venues_select_public still status=active', 'present+active',
    COALESCE(v_policy_def, 'MISSING'),
    CASE
      WHEN v_policy_def IS NOT NULL AND v_policy_def LIKE '%active%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'venues'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  INSERT INTO t052_report VALUES (
    'rls', 'no client write policies on venues', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Organizer create
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.create_venue_atomic(
    '052 Organizer Venue',
    v_org_user,
    'club',
    'Girne Marina',
    'Girne',
    NULL,
    35.336, 33.318,
    200,
    v_district,
    v_org_id,
    NULL
  );
  EXECUTE 'RESET ROLE';
  v_venue_org := NULLIF(v_result->>'venue_id', '')::uuid;
  SELECT owner_id, created_by, status
    INTO v_owner, v_created, v_status
  FROM public.venues WHERE id = v_venue_org;
  INSERT INTO t052_report VALUES (
    'create', 'organizer create success', 'true/draft',
    COALESCE(v_result->>'success', 'NULL') || '/' || COALESCE(v_status, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_status = 'draft' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t052_report VALUES (
    'create', 'organizer created_by=owner_id=self', 'self/self',
    COALESCE(v_created::text, 'NULL') || '/' || COALESCE(v_owner::text, 'NULL'),
    CASE WHEN v_created = v_org_user AND v_owner = v_org_user THEN 'PASS' ELSE 'FAIL' END
  );

  -- VO create without org
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_venue_atomic('052 VO Venue', NULL, 'restaurant');
  EXECUTE 'RESET ROLE';
  v_venue_vo := NULLIF(v_result->>'venue_id', '')::uuid;
  SELECT owner_id, created_by, status, organization_id
    INTO v_owner, v_created, v_status, v_inactive_district
  FROM public.venues WHERE id = v_venue_vo;
  INSERT INTO t052_report VALUES (
    'create', 'VO create success without org', 'true/draft/null-org',
    COALESCE(v_result->>'success', 'NULL') || '/' || COALESCE(v_status, 'NULL') || '/' || COALESCE(v_inactive_district::text, 'null-org'),
    CASE
      WHEN v_result->>'success' = 'true' AND v_status = 'draft' AND v_owner = v_vo_user AND v_created = v_vo_user
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  -- Unapproved reject
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_unapproved::text, true);
  v_result := public.create_venue_atomic('052 Unapproved Venue');
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'create', 'unapproved VO rejected', 'OWNER_NOT_ELIGIBLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_ELIGIBLE' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Customer / spider cannot write
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_spider::text, true);
  v_result := public.create_venue_atomic('052 Spider Venue');
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'security', 'spider/customer cannot create venue', 'OWNER_NOT_ELIGIBLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_ELIGIBLE' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname ILIKE '%spider%';
  INSERT INTO t052_report VALUES (
    'security', 'no spider write RPC', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA other-owner success
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.create_venue_atomic('052 SA For VO', v_vo_user, 'hotel');
  EXECUTE 'RESET ROLE';
  v_venue_sa := NULLIF(v_result->>'venue_id', '')::uuid;
  SELECT owner_id, created_by, status
    INTO v_owner, v_created, v_status
  FROM public.venues WHERE id = v_venue_sa;
  INSERT INTO t052_report VALUES (
    'create', 'SA other-owner success', 'created_by=SA owner=VO draft',
    COALESCE(v_created::text, 'NULL') || '/' || COALESCE(v_owner::text, 'NULL') || '/' || COALESCE(v_status, 'NULL'),
    CASE
      WHEN v_result->>'success' = 'true' AND v_created = v_sa AND v_owner = v_vo_user AND v_status = 'draft'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  -- SA cannot self-own
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.create_venue_atomic('052 SA Self', v_sa);
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'create', 'SA cannot self-own', 'SA_CANNOT_SELF_OWN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'SA_CANNOT_SELF_OWN' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.create_venue_atomic('052 SA Missing Owner');
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'create', 'SA owner required', 'OWNER_REQUIRED',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_REQUIRED' THEN 'PASS' ELSE 'FAIL' END
  );

  -- VO cannot assign another owner
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_venue_atomic('052 VO Other Owner', v_org_user);
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'create', 'VO cannot assign other owner', 'OWNER_NOT_SELF',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'OWNER_NOT_SELF' THEN 'PASS' ELSE 'FAIL' END
  );

  -- VO cannot attach org they do not manage
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_venue_atomic(
    '052 VO Stolen Org', v_vo_user, 'other', NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_org_id
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'org', 'VO cannot attach unmanaged org', 'ORGANIZATION_FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'ORGANIZATION_FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner can edit own draft
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.update_venue_atomic(v_venue_vo, '052 VO Venue Edited');
  EXECUTE 'RESET ROLE';
  SELECT name INTO v_status FROM public.venues WHERE id = v_venue_vo;
  INSERT INTO t052_report VALUES (
    'update', 'owner can edit own draft', '052 VO Venue Edited',
    COALESCE(v_status, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_status = '052 VO Venue Edited' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Org admin can manage org venue
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_admin::text, true);
  v_bool := public.can_manage_venue(v_venue_org);
  v_result := public.submit_venue_for_review(v_venue_org);
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'org', 'org admin can_manage_venue', 'true',
    COALESCE(v_bool::text, 'NULL'),
    CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t052_report VALUES (
    'org', 'org admin can submit org venue', 'in_review',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_result->>'status' = 'in_review' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Reset org venue back to draft for owner submit path later
  UPDATE public.venues SET status = 'draft' WHERE id = v_venue_org;

  -- Org member cannot manage
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_member::text, true);
  v_bool := public.can_manage_venue(v_venue_org);
  v_result := public.submit_venue_for_review(v_venue_org);
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'org', 'org member cannot manage/submit', 'false/FORBIDDEN',
    COALESCE(v_bool::text, 'NULL') || '/' || COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_bool IS NOT TRUE AND v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner submit
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.submit_venue_for_review(v_venue_org);
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'lifecycle', 'owner submit draft→in_review', 'in_review',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'in_review' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner cannot approve / hide / unhide / archive
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.approve_venue(v_venue_org);
  INSERT INTO t052_report VALUES (
    'auth', 'owner cannot approve', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.hide_venue(v_venue_org);
  INSERT INTO t052_report VALUES (
    'auth', 'owner cannot hide', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.unhide_venue(v_venue_org);
  INSERT INTO t052_report VALUES (
    'auth', 'owner cannot unhide', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.archive_venue(v_venue_org);
  INSERT INTO t052_report VALUES (
    'auth', 'owner cannot archive', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  -- Invalid transition: approve from draft (use VO draft venue)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_venue(v_venue_vo);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'approve from draft invalid', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.hide_venue(v_venue_vo);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'hide from draft invalid', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.approve_venue(v_venue_org);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'SA approve in_review→active', 'active',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'active' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.submit_venue_for_review(v_venue_org);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'submit from active invalid', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  -- Public visibility: active only
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.venues WHERE id = v_venue_org;
  SELECT count(*) INTO v_cnt2 FROM public.venues WHERE id = v_venue_vo;
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'public', 'anon sees active venue', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t052_report VALUES (
    'public', 'anon does not see draft', '0', v_cnt2::text,
    CASE WHEN v_cnt2 = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Prepare lifecycle venues
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_venue_atomic('052 Life Venue');
  v_venue_life := NULLIF(v_result->>'venue_id', '')::uuid;
  v_result := public.submit_venue_for_review(v_venue_life);
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_venue(v_venue_life);
  EXECUTE 'RESET ROLE';

  INSERT INTO public.events (id, owner_id, venue_id, title, category, status, starts_at)
  VALUES (
    v_event_id, v_org_user, v_venue_life, '052 Published Event', 'concert',
    'published', now() + interval '7 days'
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);

  -- 2D write allowed while active
  v_result := public.update_venue_layout_canvas_atomic(v_venue_life, 1000, 800, 10);
  INSERT INTO t052_report VALUES (
    'layout', '2D write allowed on active', 'true',
    COALESCE(v_result->>'success', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  v_result := public.hide_venue(v_venue_life);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'SA hide active→hidden', 'hidden',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'hidden' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT status INTO v_event_status FROM public.events WHERE id = v_event_id;
  INSERT INTO t052_report VALUES (
    'events', 'published event stays published after hide', 'published',
    COALESCE(v_event_status, 'NULL'),
    CASE WHEN v_event_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  v_result := public.update_venue_layout_canvas_atomic(v_venue_life, 1100, 800, 10);
  INSERT INTO t052_report VALUES (
    'layout', '2D write forbidden on hidden', 'VENUE_NOT_EDITABLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_EDITABLE' THEN 'PASS' ELSE 'FAIL' END
  );

  v_result := public.update_venue_atomic(v_venue_life, 'should not edit hidden');
  INSERT INTO t052_report VALUES (
    'update', 'metadata write forbidden on hidden', 'VENUE_NOT_EDITABLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_EDITABLE' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Public cannot see hidden
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.venues WHERE id = v_venue_life;
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'public', 'anon does not see hidden', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.unhide_venue(v_venue_life);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'SA unhide hidden→active', 'active',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'active' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.hide_venue(v_venue_life);
  v_result := public.archive_venue(v_venue_life);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'SA archive hidden→archived', 'archived',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'archived' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.unhide_venue(v_venue_life);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'archive cannot reactivate via unhide', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.approve_venue(v_venue_life);
  INSERT INTO t052_report VALUES (
    'lifecycle', 'archive cannot reactivate via approve', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.update_venue_layout_canvas_atomic(v_venue_life, 1200, 800, 10);
  INSERT INTO t052_report VALUES (
    'layout', '2D write forbidden on archived', 'VENUE_NOT_EDITABLE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'VENUE_NOT_EDITABLE' THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_event_status FROM public.events WHERE id = v_event_id;
  INSERT INTO t052_report VALUES (
    'events', 'published event stays published after archive', 'published',
    COALESCE(v_event_status, 'NULL'),
    CASE WHEN v_event_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.venues WHERE id = v_venue_life;
  SELECT count(*) INTO v_cnt2 FROM public.events WHERE id = v_event_id AND status = 'published';
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'public', 'anon does not see archived', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t052_report VALUES (
    'public', 'anon still sees published event after venue archive', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- in_review not public
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_venue_atomic('052 Review Venue');
  v_venue_hide := NULLIF(v_result->>'venue_id', '')::uuid;
  v_result := public.submit_venue_for_review(v_venue_hide);
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.venues WHERE id = v_venue_hide;
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'public', 'anon does not see in_review', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Client cannot INSERT/UPDATE/DELETE venues
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
    INSERT INTO public.venues (id, owner_id, created_by, name)
    VALUES ('f0520002-0002-4002-8002-000000000002', v_vo_user, v_vo_user, 'direct insert');
    EXECUTE 'RESET ROLE';
    INSERT INTO t052_report VALUES (
      'rls', 'client cannot INSERT venues', 'denied', 'inserted', 'FAIL'
    );
    DELETE FROM public.venues WHERE id = 'f0520002-0002-4002-8002-000000000002';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t052_report VALUES (
      'rls', 'client cannot INSERT venues', 'denied', SQLERRM, 'PASS'
    );
  END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
    UPDATE public.venues SET name = 'hacked' WHERE id = v_venue_vo;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO t052_report VALUES (
      'rls', 'client cannot UPDATE venues', '0', v_cnt::text,
      CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t052_report VALUES (
      'rls', 'client cannot UPDATE venues', 'denied', SQLERRM, 'PASS'
    );
  END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_sa, 'VENUE_CREATED', 'venue', v_venue_vo);
    EXECUTE 'RESET ROLE';
    INSERT INTO t052_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t052_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', SQLERRM, 'PASS'
    );
  END;

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'VENUE_CREATED' AND target_id = v_venue_org AND actor_id = v_org_user;
  INSERT INTO t052_report VALUES (
    'audit', 'VENUE_CREATED written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'VENUE_SUBMITTED' AND target_id = v_venue_org;
  INSERT INTO t052_report VALUES (
    'audit', 'VENUE_SUBMITTED written', '1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'VENUE_APPROVED' AND target_id = v_venue_org AND actor_id = v_sa;
  INSERT INTO t052_report VALUES (
    'audit', 'VENUE_APPROVED written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'VENUE_HIDDEN' AND target_id = v_venue_life AND actor_id = v_sa;
  INSERT INTO t052_report VALUES (
    'audit', 'VENUE_HIDDEN written', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'VENUE_UNHIDDEN' AND target_id = v_venue_life AND actor_id = v_sa;
  INSERT INTO t052_report VALUES (
    'audit', 'VENUE_UNHIDDEN written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'VENUE_ARCHIVED' AND target_id = v_venue_life AND actor_id = v_sa;
  INSERT INTO t052_report VALUES (
    'audit', 'VENUE_ARCHIVED written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- District must exist
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_vo_user::text, true);
  v_result := public.create_venue_atomic(
    '052 Bad District', NULL, 'other', NULL, NULL, NULL, NULL, NULL, NULL,
    'd0520001-0001-4001-8001-000000000001'
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t052_report VALUES (
    'create', 'missing district rejected', 'DISTRICT_NOT_FOUND',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'DISTRICT_NOT_FOUND' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Cleanup
  DELETE FROM public.admin_audit_log
  WHERE actor_id IN (v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider)
     OR target_id IN (v_venue_org, v_venue_vo, v_venue_sa, v_venue_life, v_venue_hide, v_event_id);
  DELETE FROM public.events WHERE id = v_event_id;
  DELETE FROM public.venue_areas WHERE venue_id IN (
    SELECT id FROM public.venues
    WHERE owner_id IN (v_sa, v_org_user, v_vo_user, v_org_admin)
       OR created_by IN (v_sa, v_org_user, v_vo_user)
  );
  DELETE FROM public.venues
  WHERE owner_id IN (v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider)
     OR created_by IN (v_sa, v_org_user, v_vo_user);
  DELETE FROM public.organization_memberships WHERE organization_id = v_org_id;
  DELETE FROM public.organizer_profiles WHERE profile_id IN (v_org_user, v_org_admin, v_org_member);
  DELETE FROM public.venue_owner_profiles WHERE profile_id IN (v_vo_user, v_unapproved);
  DELETE FROM public.super_admin_profiles WHERE profile_id = v_sa;
  DELETE FROM public.organizations WHERE id = v_org_id;
  DELETE FROM public.profiles WHERE id IN (
    v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider
  );
  DELETE FROM auth.users WHERE id IN (
    v_sa, v_org_user, v_vo_user, v_unapproved, v_customer, v_org_admin, v_org_member, v_spider
  );
END $$;

SELECT section, test_name, expected, actual, result
FROM t052_report
ORDER BY section, test_name;
