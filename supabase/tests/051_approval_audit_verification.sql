-- 051 Approval + Audit — local/staging verification (NEVER production)
-- Run AFTER applying migration 051 on a non-production database.
-- Usage (local Supabase):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/051_approval_audit_verification.sql

\set ON_ERROR_STOP on

DELETE FROM public.admin_audit_log WHERE actor_id IN (
  'a0510001-0001-4001-8001-000000000001',
  'a0510002-0002-4002-8002-000000000002',
  'a0510003-0003-4003-8003-000000000003',
  'a0510004-0004-4004-8004-000000000004',
  'a0510005-0005-4005-8005-000000000005'
) OR target_id IN (
  'b0510001-0001-4001-8001-000000000001',
  'b0510002-0002-4002-8002-000000000002',
  'b0510003-0003-4003-8003-000000000003',
  'b0510004-0004-4004-8004-000000000004',
  'b0510005-0005-4005-8005-000000000005',
  'b0510006-0006-4006-8006-000000000006'
);
DELETE FROM public.account_applications WHERE id IN (
  'b0510001-0001-4001-8001-000000000001',
  'b0510002-0002-4002-8002-000000000002',
  'b0510003-0003-4003-8003-000000000003',
  'b0510004-0004-4004-8004-000000000004',
  'b0510005-0005-4005-8005-000000000005',
  'b0510006-0006-4006-8006-000000000006'
);
DELETE FROM public.organization_memberships WHERE profile_id IN (
  'a0510001-0001-4001-8001-000000000001',
  'a0510002-0002-4002-8002-000000000002',
  'a0510003-0003-4003-8003-000000000003',
  'a0510004-0004-4004-8004-000000000004',
  'a0510005-0005-4005-8005-000000000005'
);
DELETE FROM public.organizer_profiles WHERE profile_id IN (
  'a0510001-0001-4001-8001-000000000001',
  'a0510002-0002-4002-8002-000000000002',
  'a0510003-0003-4003-8003-000000000003',
  'a0510004-0004-4004-8004-000000000004',
  'a0510005-0005-4005-8005-000000000005'
);
DELETE FROM public.venue_owner_profiles WHERE profile_id IN (
  'a0510001-0001-4001-8001-000000000001',
  'a0510002-0002-4002-8002-000000000002',
  'a0510003-0003-4003-8003-000000000003',
  'a0510004-0004-4004-8004-000000000004',
  'a0510005-0005-4005-8005-000000000005'
);
DELETE FROM public.super_admin_profiles WHERE profile_id = 'a0510001-0001-4001-8001-000000000001';
DELETE FROM public.events WHERE id = 'e0510001-0001-4001-8001-000000000001';
DELETE FROM public.venues WHERE id = 'v0510001-0001-4001-8001-000000000001';
DELETE FROM public.organizations WHERE id = 'c0510001-0001-4001-8001-000000000001';
DELETE FROM public.profiles WHERE id IN (
  'a0510001-0001-4001-8001-000000000001',
  'a0510002-0002-4002-8002-000000000002',
  'a0510003-0003-4003-8003-000000000003',
  'a0510004-0004-4004-8004-000000000004',
  'a0510005-0005-4005-8005-000000000005'
);
DELETE FROM auth.users WHERE id IN (
  'a0510001-0001-4001-8001-000000000001',
  'a0510002-0002-4002-8002-000000000002',
  'a0510003-0003-4003-8003-000000000003',
  'a0510004-0004-4004-8004-000000000004',
  'a0510005-0005-4005-8005-000000000005'
);

CREATE TEMP TABLE t051_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_sa uuid := 'a0510001-0001-4001-8001-000000000001';
  v_org_user uuid := 'a0510002-0002-4002-8002-000000000002';
  v_venue_user uuid := 'a0510003-0003-4003-8003-000000000003';
  v_applicant_org uuid := 'a0510004-0004-4004-8004-000000000004';
  v_applicant_vo uuid := 'a0510005-0005-4005-8005-000000000005';
  v_app_org uuid := 'b0510001-0001-4001-8001-000000000001';
  v_app_vo uuid := 'b0510002-0002-4002-8002-000000000002';
  v_app_other uuid := 'b0510003-0003-4003-8003-000000000003';
  v_app_reject uuid := 'b0510004-0004-4004-8004-000000000004';
  v_app_atomic uuid := 'b0510005-0005-4005-8005-000000000005';
  v_app_missing uuid := 'b0510006-0006-4006-8006-000000000006';
  v_org_id uuid := 'c0510001-0001-4001-8001-000000000001';
  v_venue_id uuid := 'v0510001-0001-4001-8001-000000000001';
  v_event_id uuid := 'e0510001-0001-4001-8001-000000000001';
  v_instance uuid;
  v_role_member uuid;
  v_result jsonb;
  v_cnt int;
  v_cnt2 int;
  v_status text;
  v_account_type text;
  v_verification text;
  v_bool boolean;
  v_policy_def text;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  SELECT id INTO v_role_member FROM public.roles WHERE code = 'org_member';

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_sa, v_instance, 'authenticated', 'authenticated', '051-sa@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org_user, v_instance, 'authenticated', 'authenticated', '051-organizer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_venue_user, v_instance, 'authenticated', 'authenticated', '051-venue@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_applicant_org, v_instance, 'authenticated', 'authenticated', '051-applicant-org@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_applicant_vo, v_instance, 'authenticated', 'authenticated', '051-applicant-vo@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_sa, '051-sa@staging.test', 'customer', 'not_required', '051 Super Admin'),
    (v_org_user, '051-organizer@staging.test', 'organizer', 'approved', '051 Organizer'),
    (v_venue_user, '051-venue@staging.test', 'venue_owner', 'approved', '051 Venue Owner'),
    (v_applicant_org, '051-applicant-org@staging.test', 'customer', 'not_required', '051 Applicant Org'),
    (v_applicant_vo, '051-applicant-vo@staging.test', 'customer', 'not_required', '051 Applicant VO')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = EXCLUDED.account_type,
    verification_status = EXCLUDED.verification_status,
    full_name = EXCLUDED.full_name;

  INSERT INTO public.super_admin_profiles (profile_id) VALUES (v_sa);
  INSERT INTO public.organizer_profiles (profile_id, organization_name)
  VALUES (v_org_user, '051 Existing Organizer');
  INSERT INTO public.venue_owner_profiles (profile_id, business_name)
  VALUES (v_venue_user, '051 Existing Venue');

  INSERT INTO public.account_applications (id, applicant_id, type, status)
  VALUES
    (v_app_org, v_applicant_org, 'organizer', 'pending'),
    (v_app_vo, v_applicant_vo, 'venue_owner', 'pending'),
    (v_app_other, v_org_user, 'organizer', 'pending'),
    (v_app_reject, v_applicant_vo, 'venue_owner', 'pending'),
    (v_app_atomic, v_applicant_org, 'organizer', 'pending');

  INSERT INTO public.organizations (id, slug, name, status, created_from_profile_id)
  VALUES (v_org_id, '051-attach-org', '051 Attach Org', 'active', v_org_user);

  INSERT INTO public.venues (id, owner_id, name, status)
  VALUES (v_venue_id, v_org_user, '051 Discovery Venue', 'active');

  INSERT INTO public.events (id, owner_id, venue_id, title, category, status, starts_at)
  VALUES (
    v_event_id, v_org_user, v_venue_id, '051 Discovery Event', 'concert',
    'published', now() + interval '7 days'
  );

  -- Schema
  SELECT count(*) INTO v_cnt
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'admin_audit_log';
  INSERT INTO t051_report VALUES (
    'schema', 'admin_audit_log exists', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'approve_account_application';
  INSERT INTO t051_report VALUES (
    'schema', 'approve_account_application exists', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'create_event%';
  INSERT INTO t051_report VALUES (
    'schema', 'no create_event* RPC', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT pg_get_expr(c.polqual, c.polrelid) INTO v_policy_def
  FROM pg_policy c
  JOIN pg_class rel ON rel.oid = c.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'events'
    AND c.polname = 'events_insert_owner_draft';
  INSERT INTO t051_report VALUES (
    'schema', 'events_insert_owner_draft untouched', 'present+approved',
    COALESCE(v_policy_def, 'MISSING'),
    CASE
      WHEN v_policy_def IS NOT NULL AND v_policy_def LIKE '%verification_status%' AND v_policy_def LIKE '%approved%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'account_applications'
    AND cmd = 'UPDATE';
  INSERT INTO t051_report VALUES (
    'rls', 'no client UPDATE policy on applications', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT relrowsecurity INTO v_bool
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'admin_audit_log';
  INSERT INTO t051_report VALUES (
    'rls', 'admin_audit_log RLS enabled', 'true', v_bool::text,
    CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END
  );

  -- Public cannot read applications / audit
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.account_applications WHERE id = v_app_org;
  SELECT count(*) INTO v_cnt2 FROM public.admin_audit_log;
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'rls', 'anon cannot SELECT account_applications', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'rls', 'anon cannot SELECT admin_audit_log', '0', v_cnt2::text,
    CASE WHEN v_cnt2 = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Applicant can SELECT own application
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_applicant_org::text, true);
  SELECT count(*) INTO v_cnt FROM public.account_applications WHERE id = v_app_org;
  SELECT count(*) INTO v_cnt2 FROM public.account_applications WHERE id = v_app_vo;
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'rls', 'applicant SELECT own application', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'rls', 'applicant cannot SELECT other application', '0', v_cnt2::text,
    CASE WHEN v_cnt2 = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Organizer cannot UPDATE another application
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
    UPDATE public.account_applications SET status = 'approved' WHERE id = v_app_org;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'organizer cannot UPDATE another application', '0', v_cnt::text,
      CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'organizer cannot UPDATE another application', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Venue owner cannot UPDATE another application
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_venue_user::text, true);
    UPDATE public.account_applications SET status = 'approved' WHERE id = v_app_org;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'venue owner cannot UPDATE another application', '0', v_cnt::text,
      CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'venue owner cannot UPDATE another application', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Public / anon cannot approve
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM set_config('request.jwt.claim.sub', '', true);
    v_result := public.approve_account_application(v_app_org, 'approve');
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'anon cannot approve', 'denied',
      COALESCE(v_result->>'error_code', v_result::text),
      CASE
        WHEN v_result->>'success' = 'false' THEN 'PASS'
        ELSE 'FAIL'
      END
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'anon cannot approve', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Organizer cannot approve via RPC
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  v_result := public.approve_account_application(v_app_org, 'approve');
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'security', 'organizer RPC approve forbidden', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Venue owner cannot approve via RPC
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_venue_user::text, true);
  v_result := public.approve_account_application(v_app_org, 'approve');
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'security', 'venue owner RPC approve forbidden', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Super Admin can approve organizer + optional existing org attach
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_account_application(v_app_org, 'approve', NULL, v_org_id);
  EXECUTE 'RESET ROLE';
  SELECT account_type, verification_status
    INTO v_account_type, v_verification
  FROM public.profiles WHERE id = v_applicant_org;
  SELECT count(*) INTO v_cnt FROM public.organizer_profiles WHERE profile_id = v_applicant_org;
  SELECT count(*) INTO v_cnt2
  FROM public.organization_memberships
  WHERE organization_id = v_org_id AND profile_id = v_applicant_org AND status = 'active';
  INSERT INTO t051_report VALUES (
    'approve', 'SA approve organizer success', 'true',
    COALESCE(v_result->>'success', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'approve', 'profile type+verification after organizer approve', 'organizer/approved',
    COALESCE(v_account_type, 'NULL') || '/' || COALESCE(v_verification, 'NULL'),
    CASE WHEN v_account_type = 'organizer' AND v_verification = 'approved' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'approve', 'organizer_profiles row created', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'approve', 'existing org membership attached', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE target_id = v_app_org
    AND action = 'approve_account_application'
    AND actor_id = v_sa;
  INSERT INTO t051_report VALUES (
    'audit', 'audit row created on approve', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Second approve fails
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_account_application(v_app_org, 'approve');
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'approve', 'second approve fails', 'APPLICATION_NOT_PENDING',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'APPLICATION_NOT_PENDING' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Missing application fails
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_account_application(v_app_missing, 'approve');
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'approve', 'missing application fails', 'APPLICATION_NOT_FOUND',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'APPLICATION_NOT_FOUND' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Venue owner approve (no org attach)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_account_application(v_app_vo, 'approve');
  EXECUTE 'RESET ROLE';
  SELECT account_type, verification_status
    INTO v_account_type, v_verification
  FROM public.profiles WHERE id = v_applicant_vo;
  SELECT count(*) INTO v_cnt FROM public.venue_owner_profiles WHERE profile_id = v_applicant_vo;
  INSERT INTO t051_report VALUES (
    'approve', 'profile type+verification after venue_owner approve', 'venue_owner/approved',
    COALESCE(v_account_type, 'NULL') || '/' || COALESCE(v_verification, 'NULL'),
    CASE WHEN v_account_type = 'venue_owner' AND v_verification = 'approved' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'approve', 'venue_owner_profiles row created', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Reject path
  UPDATE public.account_applications SET status = 'pending' WHERE id = v_app_reject;
  UPDATE public.profiles
  SET account_type = 'customer', verification_status = 'not_required'
  WHERE id = v_applicant_vo;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_account_application(v_app_reject, 'reject', 'incomplete docs');
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.account_applications WHERE id = v_app_reject;
  SELECT verification_status INTO v_verification FROM public.profiles WHERE id = v_applicant_vo;
  INSERT INTO t051_report VALUES (
    'reject', 'reject sets application rejected', 'rejected',
    COALESCE(v_status, 'NULL'),
    CASE WHEN v_status = 'rejected' AND v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t051_report VALUES (
    'reject', 'reject sets verification rejected', 'rejected',
    COALESCE(v_verification, 'NULL'),
    CASE WHEN v_verification = 'rejected' THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA can SELECT audit; organizer cannot
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  SELECT count(*) INTO v_cnt FROM public.admin_audit_log WHERE target_id = v_app_org;
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'rls', 'SA can SELECT admin_audit_log', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org_user::text, true);
  SELECT count(*) INTO v_cnt FROM public.admin_audit_log WHERE target_id = v_app_org;
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'rls', 'organizer cannot SELECT admin_audit_log', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Failed transaction leaves no partial data
  CREATE OR REPLACE FUNCTION public.t051_fail_audit()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $trig$
  BEGIN
    RAISE EXCEPTION 'T051_FORCED_AUDIT_FAIL';
  END;
  $trig$;

  CREATE TRIGGER t051_fail_audit
    BEFORE INSERT ON public.admin_audit_log
    FOR EACH ROW
    WHEN (NEW.target_id = 'b0510005-0005-4005-8005-000000000005')
    EXECUTE FUNCTION public.t051_fail_audit();

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
    v_result := public.approve_account_application(v_app_atomic, 'approve');
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'atomicity', 'mid-function audit failure rolls back', 'exception', 'no exception', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    SELECT status INTO v_status FROM public.account_applications WHERE id = v_app_atomic;
    SELECT verification_status INTO v_verification FROM public.profiles WHERE id = v_applicant_org;
    SELECT count(*) INTO v_cnt FROM public.admin_audit_log WHERE target_id = v_app_atomic;
    INSERT INTO t051_report VALUES (
      'atomicity', 'mid-function audit failure rolls back',
      'pending+no-audit',
      COALESCE(v_status, 'NULL') || '/' || v_cnt::text,
      CASE
        WHEN SQLERRM LIKE '%T051_FORCED_AUDIT_FAIL%' AND v_status = 'pending' AND v_cnt = 0
        THEN 'PASS' ELSE 'FAIL'
      END
    );
  END;

  DROP TRIGGER IF EXISTS t051_fail_audit ON public.admin_audit_log;
  DROP FUNCTION IF EXISTS public.t051_fail_audit();

  -- Public discovery still works
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_id AND status = 'published';
  EXECUTE 'RESET ROLE';
  INSERT INTO t051_report VALUES (
    'discovery', 'anon published event SELECT', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Client cannot forge audit inserts (including Super Admin role)
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_sa, 'forged', 'account_application', v_app_org);
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'client cannot forge audit INSERT', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t051_report VALUES (
      'security', 'client cannot forge audit INSERT', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Super Admin is not auto-converted to organizer
  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = v_sa;
  SELECT count(*) INTO v_cnt FROM public.organizer_profiles WHERE profile_id = v_sa;
  INSERT INTO t051_report VALUES (
    'eligibility', 'SA remains non-organizer', 'customer/0',
    COALESCE(v_account_type, 'NULL') || '/' || v_cnt::text,
    CASE WHEN v_account_type = 'customer' AND v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Cleanup
  DELETE FROM public.admin_audit_log WHERE actor_id IN (v_sa, v_org_user, v_venue_user, v_applicant_org, v_applicant_vo)
    OR target_id IN (v_app_org, v_app_vo, v_app_other, v_app_reject, v_app_atomic);
  DELETE FROM public.account_applications WHERE id IN (v_app_org, v_app_vo, v_app_other, v_app_reject, v_app_atomic);
  DELETE FROM public.organization_memberships WHERE organization_id = v_org_id;
  DELETE FROM public.events WHERE id = v_event_id;
  DELETE FROM public.venues WHERE id = v_venue_id;
  DELETE FROM public.organizer_profiles WHERE profile_id IN (v_org_user, v_applicant_org);
  DELETE FROM public.venue_owner_profiles WHERE profile_id IN (v_venue_user, v_applicant_vo);
  DELETE FROM public.super_admin_profiles WHERE profile_id = v_sa;
  DELETE FROM public.organizations WHERE id = v_org_id;
  DELETE FROM public.profiles WHERE id IN (v_sa, v_org_user, v_venue_user, v_applicant_org, v_applicant_vo);
  DELETE FROM auth.users WHERE id IN (v_sa, v_org_user, v_venue_user, v_applicant_org, v_applicant_vo);
END $$;

SELECT section, test_name, expected, actual, result
FROM t051_report
ORDER BY section, test_name;
