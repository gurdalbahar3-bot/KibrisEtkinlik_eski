-- 054 Event Lifecycle — local/staging verification (NEVER production)
-- Run AFTER applying migration 054 on a non-production database.
-- Usage (local Supabase):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/054_event_lifecycle_verification.sql
-- Do NOT place this file in supabase/migrations/.

\set ON_ERROR_STOP on

DELETE FROM public.admin_audit_log WHERE actor_id IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002',
  'a0540003-0003-4003-8003-000000000003',
  'a0540004-0004-4004-8004-000000000004',
  'a0540005-0005-4005-8005-000000000005'
) OR target_id IN (
  SELECT id FROM public.events WHERE owner_id IN (
    'a0540001-0001-4001-8001-000000000001',
    'a0540002-0002-4002-8002-000000000002',
    'a0540003-0003-4003-8003-000000000003'
  ) OR created_by IN (
    'a0540001-0001-4001-8001-000000000001',
    'a0540002-0002-4002-8002-000000000002',
    'a0540003-0003-4003-8003-000000000003'
  ) OR id IN (
    'e0540001-0001-4001-8001-000000000001',
    'e0540002-0002-4002-8002-000000000002'
  )
);
DELETE FROM public.event_change_requests WHERE requester_id IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002',
  'a0540003-0003-4003-8003-000000000003',
  'a0540004-0004-4004-8004-000000000004',
  'a0540005-0005-4005-8005-000000000005'
);
DELETE FROM public.event_schedule_changes WHERE changed_by IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002'
);
DELETE FROM public.events WHERE owner_id IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002',
  'a0540003-0003-4003-8003-000000000003',
  'a0540004-0004-4004-8004-000000000004',
  'a0540005-0005-4005-8005-000000000005'
) OR created_by IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002',
  'a0540003-0003-4003-8003-000000000003'
) OR id IN (
  'e0540001-0001-4001-8001-000000000001',
  'e0540002-0002-4002-8002-000000000002'
);
DELETE FROM public.venues WHERE id IN (
  'b0540001-0001-4001-8001-000000000001',
  'b0540002-0002-4002-8002-000000000002'
) OR owner_id IN (
  'a0540003-0003-4003-8003-000000000003'
);
DELETE FROM public.organizer_profiles WHERE profile_id IN (
  'a0540002-0002-4002-8002-000000000002'
);
DELETE FROM public.venue_owner_profiles WHERE profile_id IN (
  'a0540003-0003-4003-8003-000000000003'
);
DELETE FROM public.super_admin_profiles WHERE profile_id = 'a0540001-0001-4001-8001-000000000001';
DELETE FROM public.profiles WHERE id IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002',
  'a0540003-0003-4003-8003-000000000003',
  'a0540004-0004-4004-8004-000000000004',
  'a0540005-0005-4005-8005-000000000005'
);
DELETE FROM auth.users WHERE id IN (
  'a0540001-0001-4001-8001-000000000001',
  'a0540002-0002-4002-8002-000000000002',
  'a0540003-0003-4003-8003-000000000003',
  'a0540004-0004-4004-8004-000000000004',
  'a0540005-0005-4005-8005-000000000005'
);

CREATE TEMP TABLE t054_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_sa uuid := 'a0540001-0001-4001-8001-000000000001';
  v_org uuid := 'a0540002-0002-4002-8002-000000000002';
  v_vo uuid := 'a0540003-0003-4003-8003-000000000003';
  v_customer uuid := 'a0540004-0004-4004-8004-000000000004';
  v_unapproved uuid := 'a0540005-0005-4005-8005-000000000005';
  v_venue uuid := 'b0540001-0001-4001-8001-000000000001';
  v_venue_hide uuid := 'b0540002-0002-4002-8002-000000000002';
  v_existing_pub uuid := 'e0540001-0001-4001-8001-000000000001';
  v_existing_post uuid := 'e0540002-0002-4002-8002-000000000002';
  v_instance uuid;
  v_starts timestamptz := now() + interval '14 days';
  v_new_start timestamptz := now() + interval '21 days';
  v_new_end timestamptz := now() + interval '21 days 4 hours';
  v_result jsonb;
  v_cnt int;
  v_cnt2 int;
  v_status text;
  v_title text;
  v_starts_at timestamptz;
  v_reason text;
  v_event_create uuid;
  v_event_life uuid;
  v_event_emergency uuid;
  v_event_cancel_pub uuid;
  v_event_cancel_post uuid;
  v_event_cancel_unpub uuid;
  v_event_complete_post uuid;
  v_event_hide uuid;
  v_event_trig_draft uuid;
  v_event_trig_review uuid;
  v_event_trig_approved uuid;
  v_event_trig_pub uuid;
  v_event_trig_post uuid;
  v_event_trig_unpub uuid;
  v_event_trig_cancel uuid;
  v_event_trig_done uuid;
  v_event_change_post uuid;
  v_event_change_resched uuid;
  v_req_id uuid;
  v_req_id2 uuid;
  v_req_status text;
  v_bool boolean;
  v_policy_def text;
  v_grant_status boolean;
  r record;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_sa, v_instance, 'authenticated', 'authenticated', '054-sa@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org, v_instance, 'authenticated', 'authenticated', '054-organizer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_vo, v_instance, 'authenticated', 'authenticated', '054-venue@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer, v_instance, 'authenticated', 'authenticated', '054-customer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_unapproved, v_instance, 'authenticated', 'authenticated', '054-unapproved@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_sa, '054-sa@staging.test', 'customer', 'not_required', '054 Super Admin'),
    (v_org, '054-organizer@staging.test', 'organizer', 'approved', '054 Organizer'),
    (v_vo, '054-venue@staging.test', 'venue_owner', 'approved', '054 Venue Owner'),
    (v_customer, '054-customer@staging.test', 'customer', 'not_required', '054 Customer'),
    (v_unapproved, '054-unapproved@staging.test', 'organizer', 'pending', '054 Unapproved')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = EXCLUDED.account_type,
    verification_status = EXCLUDED.verification_status,
    full_name = EXCLUDED.full_name;

  INSERT INTO public.super_admin_profiles (profile_id) VALUES (v_sa);
  INSERT INTO public.organizer_profiles (profile_id, organization_name)
  VALUES (v_org, '054 Organizer Co');
  INSERT INTO public.venue_owner_profiles (profile_id, business_name)
  VALUES (v_vo, '054 Venue Biz');

  INSERT INTO public.venues (id, owner_id, created_by, name, status)
  VALUES
    (v_venue, v_vo, v_vo, '054 Active Venue', 'active'),
    (v_venue_hide, v_vo, v_vo, '054 Hide Venue', 'active');

  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  )
  VALUES
    (v_existing_pub, v_org, v_org, v_venue, '054 Existing Published', 'concert', 'published', v_starts),
    (v_existing_post, v_org, v_org, v_venue, '054 Existing Postponed', 'concert', 'postponed', v_starts);

  -- Schema
  SELECT count(*) INTO v_cnt
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'event_status'
    AND e.enumlabel IN ('in_review', 'approved', 'unpublished', 'draft', 'published', 'postponed', 'cancelled', 'completed');
  INSERT INTO t054_report VALUES (
    'schema', 'event_status has original + 3 new values', '8', v_cnt::text,
    CASE WHEN v_cnt = 8 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'event_change_requests';
  INSERT INTO t054_report VALUES (
    'schema', 'event_change_requests exists', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'event_schedule_changes';
  INSERT INTO t054_report VALUES (
    'schema', 'event_schedule_changes still present', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'publish_event', 'postpone_event', 'reschedule_event',
      'submit_event_for_review', 'approve_event', 'unpublish_event',
      'cancel_event', 'complete_event',
      'propose_event_schedule_change', 'decide_event_change_request',
      'create_event_atomic', 'hide_venue', 'trg_guard_events_status'
    );
  INSERT INTO t054_report VALUES (
    'schema', 'lifecycle + regression RPCs present', '13', v_cnt::text,
    CASE WHEN v_cnt = 13 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT pg_get_expr(c.polqual, c.polrelid) INTO v_policy_def
  FROM pg_policy c
  JOIN pg_class rel ON rel.oid = c.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'events'
    AND c.polname = 'events_select_public';
  INSERT INTO t054_report VALUES (
    'rls', 'events_select_public still published/postponed/completed', 'present',
    COALESCE(v_policy_def, 'MISSING'),
    CASE
      WHEN v_policy_def IS NOT NULL
       AND v_policy_def LIKE '%published%'
       AND v_policy_def LIKE '%postponed%'
       AND v_policy_def LIKE '%completed%'
       AND v_policy_def NOT LIKE '%in_review%'
       AND v_policy_def NOT LIKE '%unpublished%'
       AND v_policy_def NOT LIKE '%cancelled%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events'
    AND policyname = 'events_update_owner_draft';
  INSERT INTO t054_report VALUES (
    'rls', 'events_update_owner_draft kept', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  v_grant_status := has_column_privilege('authenticated', 'public.events', 'status', 'UPDATE');
  INSERT INTO t054_report VALUES (
    'rls', 'no client GRANT UPDATE on events.status', 'false', v_grant_status::text,
    CASE WHEN v_grant_status IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_table_privilege('authenticated', 'public.event_change_requests', 'DELETE');
  INSERT INTO t054_report VALUES (
    'rls', 'no client DELETE on event_change_requests', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_table_privilege('authenticated', 'public.event_change_requests', 'UPDATE');
  INSERT INTO t054_report VALUES (
    'rls', 'no client UPDATE on event_change_requests', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_function_privilege('anon', 'public.publish_event(uuid)', 'execute');
  INSERT INTO t054_report VALUES (
    'auth', 'anon cannot execute publish_event', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_function_privilege('authenticated', 'public.submit_event_for_review(uuid)', 'execute');
  INSERT INTO t054_report VALUES (
    'auth', 'authenticated can execute submit_event_for_review', 'true', v_bool::text,
    CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END
  );

  -- create_event_atomic still draft
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.create_event_atomic(
    '054 Create Draft',
    v_venue,
    'concert',
    v_starts
  );
  EXECUTE 'RESET ROLE';
  v_event_create := NULLIF(v_result->>'event_id', '')::uuid;
  SELECT status INTO v_status FROM public.events WHERE id = v_event_create;
  INSERT INTO t054_report VALUES (
    'regression', 'create_event_atomic still draft', 'true/draft',
    COALESCE(v_result->>'success', 'NULL') || '/' || COALESCE(v_status, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_status = 'draft' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner can patch draft fields
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  UPDATE public.events SET title = '054 Draft Patched', updated_at = now()
  WHERE id = v_event_create;
  EXECUTE 'RESET ROLE';
  SELECT title INTO v_title FROM public.events WHERE id = v_event_create;
  INSERT INTO t054_report VALUES (
    'rls', 'owner can patch draft title', '054 Draft Patched',
    COALESCE(v_title, 'NULL'),
    CASE WHEN v_title = '054 Draft Patched' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner publish FORBIDDEN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.publish_event(v_event_create);
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'auth', 'owner publish FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Customer submit FORBIDDEN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  v_result := public.submit_event_for_review(v_event_create);
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'auth', 'customer submit FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner submit draft→in_review
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.submit_event_for_review(v_event_create);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_create;
  INSERT INTO t054_report VALUES (
    'legal', 'owner submit draft→in_review', 'in_review',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'in_review' AND v_status = 'in_review' THEN 'PASS' ELSE 'FAIL' END
  );

  -- After submit, owner cannot patch
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
    UPDATE public.events SET title = 'should fail', updated_at = now()
    WHERE id = v_event_create;
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'rls', 'owner cannot patch after submit', 'denied', 'updated', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'rls', 'owner cannot patch after submit', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Owner approve FORBIDDEN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.approve_event(v_event_create);
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'auth', 'owner approve FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Publish from in_review INVALID
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.publish_event(v_event_create);
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'illegal', 'SA publish from in_review INVALID_STATE', 'INVALID_STATE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_STATE' THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA approve in_review→approved
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_event(v_event_create);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_create;
  INSERT INTO t054_report VALUES (
    'legal', 'SA approve in_review→approved', 'approved',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'approved' AND v_status = 'approved' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner publish approved still FORBIDDEN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.publish_event(v_event_create);
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'auth', 'owner publish approved FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Public cannot see approved
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_create;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'public', 'approved not in public SELECT', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA publish approved→published
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.publish_event(v_event_create);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_create;
  INSERT INTO t054_report VALUES (
    'legal', 'SA publish approved→published', 'published',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'published' AND v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_PUBLISHED' AND target_id = v_event_create AND actor_id = v_sa;
  INSERT INTO t054_report VALUES (
    'audit', 'EVENT_PUBLISHED written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_create;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'public', 'published in public SELECT', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner postpone / unpublish / cancel / complete FORBIDDEN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.postpone_event(v_event_create, 'owner try');
  INSERT INTO t054_report VALUES (
    'auth', 'owner postpone FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.unpublish_event(v_event_create);
  INSERT INTO t054_report VALUES (
    'auth', 'owner unpublish FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.cancel_event(v_event_create, 'owner try');
  INSERT INTO t054_report VALUES (
    'auth', 'owner cancel FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.complete_event(v_event_create);
  INSERT INTO t054_report VALUES (
    'auth', 'owner complete FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.reschedule_event(v_event_create, v_new_start, v_new_end);
  INSERT INTO t054_report VALUES (
    'auth', 'owner reschedule FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  -- Owner propose postpone: event unchanged
  SELECT starts_at INTO v_starts_at FROM public.events WHERE id = v_event_create;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.propose_event_schedule_change(v_event_create, 'postpone', NULL, NULL, 'rain');
  EXECUTE 'RESET ROLE';
  v_req_id := NULLIF(v_result->>'request_id', '')::uuid;
  SELECT status, starts_at INTO v_status, v_starts_at FROM public.events WHERE id = v_event_create;
  INSERT INTO t054_report VALUES (
    'change', 'owner propose postpone does not change event', 'published',
    COALESCE(v_status, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Duplicate pending fails
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.propose_event_schedule_change(v_event_create, 'reschedule', v_new_start, v_new_end, 'dup');
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'change', 'duplicate pending request fails', 'REQUEST_ALREADY_PENDING',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'REQUEST_ALREADY_PENDING' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Customer cannot propose
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES (
    'e05400c1-0001-4001-8001-000000000001', v_org, v_org, v_venue,
    '054 Customer Propose', 'concert', 'published', v_starts
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  v_result := public.propose_event_schedule_change(
    'e05400c1-0001-4001-8001-000000000001', 'postpone'
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'auth', 'customer propose FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Owner cannot decide
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.decide_event_change_request(v_req_id, 'accept');
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'auth', 'owner decide FORBIDDEN', 'FORBIDDEN',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Client cannot UPDATE request status
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
    UPDATE public.event_change_requests SET status = 'accepted' WHERE id = v_req_id;
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'rls', 'client cannot UPDATE request status', 'denied', 'updated', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'rls', 'client cannot UPDATE request status', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Client cannot DELETE request
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
    DELETE FROM public.event_change_requests WHERE id = v_req_id;
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'rls', 'client cannot DELETE request', 'denied', 'deleted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'rls', 'client cannot DELETE request', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Owner SELECT own request
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  SELECT count(*) INTO v_cnt FROM public.event_change_requests WHERE id = v_req_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'rls', 'owner select own request', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Customer cannot SELECT owner request
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  SELECT count(*) INTO v_cnt FROM public.event_change_requests WHERE id = v_req_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'rls', 'customer cannot select owner request', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA reject: event unchanged
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.decide_event_change_request(v_req_id, 'reject');
  SELECT count(*) INTO v_cnt FROM public.event_change_requests WHERE id = v_req_id;
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_create;
  SELECT status INTO v_req_status FROM public.event_change_requests WHERE id = v_req_id;
  INSERT INTO t054_report VALUES (
    'change', 'SA reject leaves event published', 'published/rejected',
    COALESCE(v_status, 'NULL') || '/' || COALESCE(v_req_status, 'NULL'),
    CASE WHEN v_status = 'published' AND v_req_status = 'rejected' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Closed request fails
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.decide_event_change_request(v_req_id, 'accept');
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'change', 'closed request decide fails', 'REQUEST_NOT_PENDING',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'REQUEST_NOT_PENDING' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Accept postpone internally
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES (
    'e05400p1-0001-4001-8001-000000000001', v_org, v_org, v_venue,
    '054 Accept Postpone', 'concert', 'published', v_starts
  );
  v_event_change_post := 'e05400p1-0001-4001-8001-000000000001';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.propose_event_schedule_change(v_event_change_post, 'postpone', NULL, NULL, 'storm');
  v_req_id2 := NULLIF(v_result->>'request_id', '')::uuid;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.decide_event_change_request(v_req_id2, 'accept');
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_change_post;
  INSERT INTO t054_report VALUES (
    'change', 'accept postpone runs postpone_event', 'postponed',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'postponed' THEN 'PASS' ELSE 'FAIL' END
  );
  SELECT count(*) INTO v_cnt
  FROM public.event_schedule_changes
  WHERE event_id = v_event_change_post AND change_type = 'postpone';
  INSERT INTO t054_report VALUES (
    'change', 'accept postpone writes event_schedule_changes', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Accept reschedule internally
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at, ends_at
  ) VALUES (
    'e05400r1-0001-4001-8001-000000000001', v_org, v_org, v_venue,
    '054 Accept Reschedule', 'concert', 'published', v_starts, v_starts + interval '3 hours'
  );
  v_event_change_resched := 'e05400r1-0001-4001-8001-000000000001';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.propose_event_schedule_change(
    v_event_change_resched, 'reschedule', v_new_start, v_new_end, 'new date'
  );
  v_req_id2 := NULLIF(v_result->>'request_id', '')::uuid;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.decide_event_change_request(v_req_id2, 'accept');
  EXECUTE 'RESET ROLE';
  SELECT status, starts_at INTO v_status, v_starts_at
  FROM public.events WHERE id = v_event_change_resched;
  INSERT INTO t054_report VALUES (
    'change', 'accept reschedule updates times + published', 'published/new',
    COALESCE(v_status, 'NULL') || '/' || CASE WHEN v_starts_at = v_new_start THEN 'new' ELSE 'old' END,
    CASE WHEN v_status = 'published' AND v_starts_at = v_new_start THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA lifecycle: postpone / reschedule / unpublish / republish / complete
  v_event_life := v_event_create;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.postpone_event(v_event_life, 'weather');
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_life;
  INSERT INTO t054_report VALUES (
    'legal', 'SA postpone published→postponed', 'postponed',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'postponed' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_life;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'public', 'postponed in public SELECT', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.reschedule_event(v_event_life, v_new_start, v_new_end);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_life;
  INSERT INTO t054_report VALUES (
    'legal', 'SA reschedule postponed→published', 'published',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.unpublish_event(v_event_life);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_life;
  INSERT INTO t054_report VALUES (
    'legal', 'SA unpublish published→unpublished', 'unpublished',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'unpublished' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_life;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'public', 'unpublished not in public SELECT', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.complete_event(v_event_life);
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'illegal', 'complete from unpublished INVALID_TRANSITION', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.publish_event(v_event_life);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_life;
  INSERT INTO t054_report VALUES (
    'legal', 'SA publish unpublished→published', 'published',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.complete_event(v_event_life);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_life;
  INSERT INTO t054_report VALUES (
    'legal', 'SA complete published→completed', 'completed',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'completed' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_life;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'public', 'completed in public SELECT', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.cancel_event(v_event_life, 'too late');
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'illegal', 'cancel completed INVALID_TRANSITION', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Cancel from published / postponed / unpublished
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES
    ('e05400k1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Cancel Pub', 'concert', 'published', v_starts),
    ('e05400k2-0002-4002-8002-000000000002', v_org, v_org, v_venue, '054 Cancel Post', 'concert', 'postponed', v_starts),
    ('e05400k3-0003-4003-8003-000000000003', v_org, v_org, v_venue, '054 Cancel Unpub', 'concert', 'unpublished', v_starts),
    ('e05400k4-0004-4004-8004-000000000004', v_org, v_org, v_venue, '054 Complete Post', 'concert', 'postponed', v_starts);
  v_event_cancel_pub := 'e05400k1-0001-4001-8001-000000000001';
  v_event_cancel_post := 'e05400k2-0002-4002-8002-000000000002';
  v_event_cancel_unpub := 'e05400k3-0003-4003-8003-000000000003';
  v_event_complete_post := 'e05400k4-0004-4004-8004-000000000004';

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.cancel_event(v_event_cancel_pub, 'host cancelled');
  SELECT status, cancellation_reason INTO v_status, v_reason
  FROM public.events WHERE id = v_event_cancel_pub;
  INSERT INTO t054_report VALUES (
    'legal', 'SA cancel published→cancelled + reason', 'cancelled/host cancelled',
    COALESCE(v_status, 'NULL') || '/' || COALESCE(v_reason, 'NULL'),
    CASE WHEN v_status = 'cancelled' AND v_reason = 'host cancelled' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.cancel_event(v_event_cancel_post, NULL);
  SELECT status INTO v_status FROM public.events WHERE id = v_event_cancel_post;
  INSERT INTO t054_report VALUES (
    'legal', 'SA cancel postponed→cancelled', 'cancelled',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'cancelled' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.cancel_event(v_event_cancel_unpub, NULL);
  SELECT status INTO v_status FROM public.events WHERE id = v_event_cancel_unpub;
  INSERT INTO t054_report VALUES (
    'legal', 'SA cancel unpublished→cancelled', 'cancelled',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'cancelled' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.complete_event(v_event_complete_post);
  SELECT status INTO v_status FROM public.events WHERE id = v_event_complete_post;
  INSERT INTO t054_report VALUES (
    'legal', 'SA complete postponed→completed', 'completed',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'completed' THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_cancel_pub;
  SELECT count(*) INTO v_cnt2 FROM public.events WHERE id = v_event_complete_post;
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'public', 'cancelled not in public SELECT', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t054_report VALUES (
    'public', 'completed-from-postponed in public SELECT', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA emergency draft→published
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES (
    'e05400em-0001-4001-8001-000000000001', v_org, v_org, v_venue,
    '054 Emergency', 'concert', 'draft', v_starts
  );
  v_event_emergency := 'e05400em-0001-4001-8001-000000000001';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.publish_event(v_event_emergency);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_emergency;
  INSERT INTO t054_report VALUES (
    'legal', 'SA emergency draft→published', 'published',
    COALESCE(v_status, v_result->>'error_code', 'NULL'),
    CASE WHEN v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );
  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_PUBLISHED_EMERGENCY'
    AND target_id = v_event_emergency
    AND actor_id = v_sa;
  INSERT INTO t054_report VALUES (
    'audit', 'EVENT_PUBLISHED_EMERGENCY written', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA submit allowed
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES (
    'e05400ss-0001-4001-8001-000000000001', v_org, v_org, v_venue,
    '054 SA Submit', 'concert', 'draft', v_starts
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.submit_event_for_review('e05400ss-0001-4001-8001-000000000001');
  EXECUTE 'RESET ROLE';
  INSERT INTO t054_report VALUES (
    'legal', 'SA may submit draft→in_review', 'in_review',
    COALESCE(v_result->>'status', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'status' = 'in_review' THEN 'PASS' ELSE 'FAIL' END
  );

  -- hide_venue does not change event status
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES (
    'e05400hv-0001-4001-8001-000000000001', v_org, v_org, v_venue_hide,
    '054 Hide Venue Event', 'concert', 'published', v_starts
  );
  v_event_hide := 'e05400hv-0001-4001-8001-000000000001';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.hide_venue(v_venue_hide);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.events WHERE id = v_event_hide;
  INSERT INTO t054_report VALUES (
    'regression', 'hide_venue does not change event status', 'published',
    COALESCE(v_status, 'NULL'),
    CASE WHEN v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Existing published / postponed unchanged
  SELECT status INTO v_status FROM public.events WHERE id = v_existing_pub;
  INSERT INTO t054_report VALUES (
    'regression', 'existing published unchanged', 'published',
    COALESCE(v_status, 'NULL'),
    CASE WHEN v_status = 'published' THEN 'PASS' ELSE 'FAIL' END
  );
  SELECT status INTO v_status FROM public.events WHERE id = v_existing_post;
  INSERT INTO t054_report VALUES (
    'regression', 'existing postponed unchanged', 'postponed',
    COALESCE(v_status, 'NULL'),
    CASE WHEN v_status = 'postponed' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Trigger fixtures
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES
    ('e0540td1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Draft', 'concert', 'draft', v_starts),
    ('e0540tr1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Review', 'concert', 'in_review', v_starts),
    ('e0540ta1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Approved', 'concert', 'approved', v_starts),
    ('e0540tp1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Pub', 'concert', 'published', v_starts),
    ('e0540to1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Post', 'concert', 'postponed', v_starts),
    ('e0540tu1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Unpub', 'concert', 'unpublished', v_starts),
    ('e0540tc1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Cancel', 'concert', 'cancelled', v_starts),
    ('e0540tn1-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Done', 'concert', 'completed', v_starts);
  v_event_trig_draft := 'e0540td1-0001-4001-8001-000000000001';
  v_event_trig_review := 'e0540tr1-0001-4001-8001-000000000001';
  v_event_trig_approved := 'e0540ta1-0001-4001-8001-000000000001';
  v_event_trig_pub := 'e0540tp1-0001-4001-8001-000000000001';
  v_event_trig_post := 'e0540to1-0001-4001-8001-000000000001';
  v_event_trig_unpub := 'e0540tu1-0001-4001-8001-000000000001';
  v_event_trig_cancel := 'e0540tc1-0001-4001-8001-000000000001';
  v_event_trig_done := 'e0540tn1-0001-4001-8001-000000000001';

  -- Same-status no-op (UPDATE OF status fires; OLD = NEW is allowed)
  UPDATE public.events SET status = status WHERE id = v_event_trig_draft;
  INSERT INTO t054_report VALUES (
    'trigger', 'same status no-op', 'draft',
    (SELECT status::text FROM public.events WHERE id = v_event_trig_draft),
    CASE WHEN (SELECT status FROM public.events WHERE id = v_event_trig_draft) = 'draft' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Legal trigger transitions on dedicated rows (keep fixtures for illegal tests)
  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at
  ) VALUES
    ('e0540td2-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Draft Pub', 'concert', 'draft', v_starts),
    ('e0540td3-0001-4001-8001-000000000001', v_org, v_org, v_venue, '054 Trig Draft Review', 'concert', 'draft', v_starts);
  UPDATE public.events SET status = 'in_review' WHERE id = 'e0540td3-0001-4001-8001-000000000001';
  INSERT INTO t054_report VALUES (
    'trigger', 'legal draft→in_review', 'in_review',
    (SELECT status::text FROM public.events WHERE id = 'e0540td3-0001-4001-8001-000000000001'),
    CASE WHEN (SELECT status FROM public.events WHERE id = 'e0540td3-0001-4001-8001-000000000001') = 'in_review' THEN 'PASS' ELSE 'FAIL' END
  );
  UPDATE public.events SET status = 'published' WHERE id = 'e0540td2-0001-4001-8001-000000000001';
  INSERT INTO t054_report VALUES (
    'trigger', 'legal draft→published (emergency path)', 'published',
    (SELECT status::text FROM public.events WHERE id = 'e0540td2-0001-4001-8001-000000000001'),
    CASE WHEN (SELECT status FROM public.events WHERE id = 'e0540td2-0001-4001-8001-000000000001') = 'published' THEN 'PASS' ELSE 'FAIL' END
  );

  FOR r IN
    SELECT * FROM (VALUES
      (v_event_trig_draft, 'approved', 'draft→approved'),
      (v_event_trig_draft, 'cancelled', 'draft→cancelled'),
      (v_event_trig_draft, 'completed', 'draft→completed'),
      (v_event_trig_draft, 'unpublished', 'draft→unpublished'),
      (v_event_trig_draft, 'postponed', 'draft→postponed'),
      (v_event_trig_review, 'draft', 'in_review→draft'),
      (v_event_trig_review, 'published', 'in_review→published'),
      (v_event_trig_review, 'cancelled', 'in_review→cancelled'),
      (v_event_trig_approved, 'draft', 'approved→draft'),
      (v_event_trig_approved, 'in_review', 'approved→in_review'),
      (v_event_trig_approved, 'cancelled', 'approved→cancelled'),
      (v_event_trig_pub, 'draft', 'published→draft'),
      (v_event_trig_pub, 'in_review', 'published→in_review'),
      (v_event_trig_pub, 'approved', 'published→approved'),
      (v_event_trig_post, 'draft', 'postponed→draft'),
      (v_event_trig_post, 'unpublished', 'postponed→unpublished'),
      (v_event_trig_post, 'in_review', 'postponed→in_review'),
      (v_event_trig_unpub, 'draft', 'unpublished→draft'),
      (v_event_trig_unpub, 'postponed', 'unpublished→postponed'),
      (v_event_trig_unpub, 'completed', 'unpublished→completed'),
      (v_event_trig_unpub, 'in_review', 'unpublished→in_review'),
      (v_event_trig_cancel, 'published', 'cancelled→published'),
      (v_event_trig_cancel, 'draft', 'cancelled→draft'),
      (v_event_trig_done, 'published', 'completed→published'),
      (v_event_trig_done, 'cancelled', 'completed→cancelled')
    ) AS t(event_id, to_status, label)
  LOOP
    BEGIN
      UPDATE public.events
      SET status = r.to_status::public.event_status
      WHERE id = r.event_id;
      INSERT INTO t054_report VALUES (
        'trigger', 'illegal ' || r.label, 'denied', 'allowed', 'FAIL'
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO t054_report VALUES (
        'trigger', 'illegal ' || r.label, 'denied', SQLERRM, 'PASS'
      );
    END;
  END LOOP;

  -- Illegal RPC states
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.approve_event(v_event_trig_approved);
  INSERT INTO t054_report VALUES (
    'illegal', 'approve from approved', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.submit_event_for_review(v_event_trig_pub);
  INSERT INTO t054_report VALUES (
    'illegal', 'submit from published', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.unpublish_event(v_event_trig_draft);
  INSERT INTO t054_report VALUES (
    'illegal', 'unpublish from draft', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.cancel_event(v_event_trig_review, NULL);
  INSERT INTO t054_report VALUES (
    'illegal', 'cancel from in_review', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.cancel_event(v_event_trig_approved, NULL);
  INSERT INTO t054_report VALUES (
    'illegal', 'cancel from approved', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.complete_event(v_event_trig_unpub);
  INSERT INTO t054_report VALUES (
    'illegal', 'complete from unpublished', 'INVALID_TRANSITION',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_TRANSITION' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.postpone_event(v_event_trig_unpub, NULL);
  INSERT INTO t054_report VALUES (
    'illegal', 'postpone from unpublished', 'INVALID_STATE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_STATE' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.reschedule_event(v_event_trig_unpub, v_new_start, v_new_end);
  INSERT INTO t054_report VALUES (
    'illegal', 'reschedule from unpublished', 'INVALID_STATE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_STATE' THEN 'PASS' ELSE 'FAIL' END
  );
  v_result := public.publish_event(v_event_trig_post);
  INSERT INTO t054_report VALUES (
    'illegal', 'publish from postponed (use reschedule)', 'INVALID_STATE',
    COALESCE(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_STATE' THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  -- Public visibility of draft / in_review
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_trig_review;
  SELECT count(*) INTO v_cnt2 FROM public.events WHERE id = v_existing_pub;
  INSERT INTO t054_report VALUES (
    'public', 'in_review not in public SELECT', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t054_report VALUES (
    'public', 'existing published still public', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_existing_post;
  INSERT INTO t054_report VALUES (
    'public', 'existing postponed still public', '1', v_cnt::text,
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END
  );
  EXECUTE 'RESET ROLE';

  -- Audit extras
  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_SUBMITTED' AND actor_id = v_org AND target_id = v_event_create;
  INSERT INTO t054_report VALUES (
    'audit', 'EVENT_SUBMITTED written', '1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );
  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_CHANGE_PROPOSED' AND actor_id = v_org;
  INSERT INTO t054_report VALUES (
    'audit', 'EVENT_CHANGE_PROPOSED written', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );
  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_CHANGE_DECIDED' AND actor_id = v_sa;
  INSERT INTO t054_report VALUES (
    'audit', 'EVENT_CHANGE_DECIDED written', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_sa, 'EVENT_PUBLISHED', 'event', v_event_create);
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t054_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', SQLERRM, 'PASS'
    );
  END;

  -- Cleanup
  DELETE FROM public.admin_audit_log
  WHERE actor_id IN (v_sa, v_org, v_vo, v_customer, v_unapproved)
     OR target_id IN (
       SELECT id FROM public.events
       WHERE owner_id IN (v_sa, v_org, v_vo, v_customer, v_unapproved)
          OR created_by IN (v_sa, v_org, v_vo)
     );
  DELETE FROM public.event_change_requests
  WHERE requester_id IN (v_sa, v_org, v_vo, v_customer, v_unapproved);
  DELETE FROM public.event_schedule_changes
  WHERE changed_by IN (v_sa, v_org);
  DELETE FROM public.events
  WHERE owner_id IN (v_sa, v_org, v_vo, v_customer, v_unapproved)
     OR created_by IN (v_sa, v_org, v_vo)
     OR id IN (v_existing_pub, v_existing_post);
  DELETE FROM public.venues WHERE id IN (v_venue, v_venue_hide);
  DELETE FROM public.organizer_profiles WHERE profile_id = v_org;
  DELETE FROM public.venue_owner_profiles WHERE profile_id = v_vo;
  DELETE FROM public.super_admin_profiles WHERE profile_id = v_sa;
  DELETE FROM public.profiles WHERE id IN (v_sa, v_org, v_vo, v_customer, v_unapproved);
  DELETE FROM auth.users WHERE id IN (v_sa, v_org, v_vo, v_customer, v_unapproved);
END $$;

SELECT section, test_name, expected, actual, result
FROM t054_report
ORDER BY section, test_name;
