-- 055 Artist + official_ticket_url — local/staging verification (NEVER production)
-- Run AFTER applying migration 055 on a non-production database.
-- Usage (local Supabase):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/055_artist_official_ticket_url_verification.sql
-- Do NOT place this file in supabase/migrations/.
-- Do NOT replace publish_event. Conceptual: 055 does not add a URL requirement to publish.

\set ON_ERROR_STOP on

DELETE FROM public.admin_audit_log WHERE actor_id IN (
  'a0550001-0001-4001-8001-000000000001',
  'a0550002-0002-4002-8002-000000000002',
  'a0550003-0003-4003-8003-000000000003',
  'a0550004-0004-4004-8004-000000000004',
  'a0550005-0005-4005-8005-000000000005',
  'a0550006-0006-4006-8006-000000000006',
  'a0550007-0007-4007-8007-000000000007'
) OR target_id IN (
  SELECT id FROM public.events WHERE owner_id IN (
    'a0550001-0001-4001-8001-000000000001',
    'a0550002-0002-4002-8002-000000000002',
    'a0550003-0003-4003-8003-000000000003'
  ) OR created_by IN (
    'a0550002-0002-4002-8002-000000000002',
    'a0550003-0003-4003-8003-000000000003'
  ) OR id IN (
    'e0550001-0001-4001-8001-000000000001',
    'e0550002-0002-4002-8002-000000000002',
    'e0550003-0003-4003-8003-000000000003',
    'e0550004-0004-4004-8004-000000000004'
  )
) OR target_id IN (
  SELECT id FROM public.artists WHERE created_by IN (
    'a0550001-0001-4001-8001-000000000001',
    'a0550002-0002-4002-8002-000000000002',
    'a0550003-0003-4003-8003-000000000003',
    'a0550006-0006-4006-8006-000000000006'
  ) OR slug LIKE '055-%'
);
DELETE FROM public.event_artists WHERE event_id IN (
  'e0550001-0001-4001-8001-000000000001',
  'e0550002-0002-4002-8002-000000000002',
  'e0550003-0003-4003-8003-000000000003',
  'e0550004-0004-4004-8004-000000000004'
) OR artist_id IN (
  SELECT id FROM public.artists WHERE slug LIKE '055-%'
);
DELETE FROM public.events WHERE owner_id IN (
  'a0550001-0001-4001-8001-000000000001',
  'a0550002-0002-4002-8002-000000000002',
  'a0550003-0003-4003-8003-000000000003',
  'a0550004-0004-4004-8004-000000000004',
  'a0550005-0005-4005-8005-000000000005',
  'a0550006-0006-4006-8006-000000000006',
  'a0550007-0007-4007-8007-000000000007'
) OR created_by IN (
  'a0550002-0002-4002-8002-000000000002',
  'a0550003-0003-4003-8003-000000000003'
) OR id IN (
  'e0550001-0001-4001-8001-000000000001',
  'e0550002-0002-4002-8002-000000000002',
  'e0550003-0003-4003-8003-000000000003',
  'e0550004-0004-4004-8004-000000000004'
);
DELETE FROM public.artists WHERE slug LIKE '055-%' OR created_by IN (
  'a0550001-0001-4001-8001-000000000001',
  'a0550002-0002-4002-8002-000000000002',
  'a0550003-0003-4003-8003-000000000003',
  'a0550006-0006-4006-8006-000000000006'
);
DELETE FROM public.venues WHERE id = 'b0550001-0001-4001-8001-000000000001'
  OR owner_id = 'a0550003-0003-4003-8003-000000000003';
DELETE FROM public.organizer_profiles WHERE profile_id IN (
  'a0550002-0002-4002-8002-000000000002',
  'a0550006-0006-4006-8006-000000000006'
);
DELETE FROM public.venue_owner_profiles WHERE profile_id = 'a0550003-0003-4003-8003-000000000003';
DELETE FROM public.super_admin_profiles WHERE profile_id = 'a0550001-0001-4001-8001-000000000001';
DELETE FROM public.profiles WHERE id IN (
  'a0550001-0001-4001-8001-000000000001',
  'a0550002-0002-4002-8002-000000000002',
  'a0550003-0003-4003-8003-000000000003',
  'a0550004-0004-4004-8004-000000000004',
  'a0550005-0005-4005-8005-000000000005',
  'a0550006-0006-4006-8006-000000000006',
  'a0550007-0007-4007-8007-000000000007'
);
DELETE FROM auth.users WHERE id IN (
  'a0550001-0001-4001-8001-000000000001',
  'a0550002-0002-4002-8002-000000000002',
  'a0550003-0003-4003-8003-000000000003',
  'a0550004-0004-4004-8004-000000000004',
  'a0550005-0005-4005-8005-000000000005',
  'a0550006-0006-4006-8006-000000000006',
  'a0550007-0007-4007-8007-000000000007'
);

CREATE TEMP TABLE t055_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_sa uuid := 'a0550001-0001-4001-8001-000000000001';
  v_org uuid := 'a0550002-0002-4002-8002-000000000002';
  v_vo uuid := 'a0550003-0003-4003-8003-000000000003';
  v_customer uuid := 'a0550004-0004-4004-8004-000000000004';
  v_unapproved uuid := 'a0550005-0005-4005-8005-000000000005';
  v_org2 uuid := 'a0550006-0006-4006-8006-000000000006';
  v_spider uuid := 'a0550007-0007-4007-8007-000000000007';
  v_venue uuid := 'b0550001-0001-4001-8001-000000000001';
  v_draft uuid := 'e0550001-0001-4001-8001-000000000001';
  v_review uuid := 'e0550002-0002-4002-8002-000000000002';
  v_published uuid := 'e0550003-0003-4003-8003-000000000003';
  v_free_pub uuid := 'e0550004-0004-4004-8004-000000000004';
  v_instance uuid;
  v_starts timestamptz := now() + interval '14 days';
  v_result jsonb;
  v_cnt int;
  v_cnt2 int;
  v_artist_a uuid;
  v_artist_b uuid;
  v_artist_c uuid;
  v_artist_other uuid;
  v_url text;
  v_status text;
  v_created uuid;
  v_is_active boolean;
  v_names text;
  v_def text;
  v_policy_def text;
  v_grant_url boolean;
  v_bool boolean;
  v_col_null text;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (v_sa, v_instance, 'authenticated', 'authenticated', '055-sa@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org, v_instance, 'authenticated', 'authenticated', '055-organizer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_vo, v_instance, 'authenticated', 'authenticated', '055-venue@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer, v_instance, 'authenticated', 'authenticated', '055-customer@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_unapproved, v_instance, 'authenticated', 'authenticated', '055-unapproved@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_org2, v_instance, 'authenticated', 'authenticated', '055-org2@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_spider, v_instance, 'authenticated', 'authenticated', '055-spider@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_sa, '055-sa@staging.test', 'customer', 'not_required', '055 Super Admin'),
    (v_org, '055-organizer@staging.test', 'organizer', 'approved', '055 Organizer'),
    (v_vo, '055-venue@staging.test', 'venue_owner', 'approved', '055 Venue Owner'),
    (v_customer, '055-customer@staging.test', 'customer', 'not_required', '055 Customer'),
    (v_unapproved, '055-unapproved@staging.test', 'organizer', 'pending', '055 Unapproved'),
    (v_org2, '055-org2@staging.test', 'organizer', 'approved', '055 Other Org'),
    (v_spider, '055-spider@staging.test', 'customer', 'not_required', '055 Spider')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = EXCLUDED.account_type,
    verification_status = EXCLUDED.verification_status,
    full_name = EXCLUDED.full_name;

  INSERT INTO public.super_admin_profiles (profile_id) VALUES (v_sa);
  INSERT INTO public.organizer_profiles (profile_id, organization_name)
  VALUES (v_org, '055 Organizer Co'), (v_org2, '055 Other Co');
  INSERT INTO public.venue_owner_profiles (profile_id, business_name)
  VALUES (v_vo, '055 Venue Biz');

  INSERT INTO public.venues (id, owner_id, created_by, name, status)
  VALUES (v_venue, v_vo, v_vo, '055 Active Venue', 'active');

  INSERT INTO public.events (
    id, owner_id, created_by, venue_id, title, category, status, starts_at, is_free
  )
  VALUES
    (v_draft, v_org, v_org, v_venue, '055 Draft Event', 'concert', 'draft', v_starts, false),
    (v_review, v_org, v_org, v_venue, '055 Review Event', 'concert', 'in_review', v_starts, false),
    (v_published, v_org, v_org, v_venue, '055 Published Event', 'concert', 'published', v_starts, false),
    (v_free_pub, v_org, v_org, v_venue, '055 Free Published', 'concert', 'published', v_starts, true);

  -- Schema
  SELECT is_nullable INTO v_col_null
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'events'
    AND column_name = 'official_ticket_url';
  INSERT INTO t055_report VALUES (
    'schema', 'official_ticket_url nullable text', 'YES', coalesce(v_col_null, 'MISSING'),
    CASE WHEN v_col_null = 'YES' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'events'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%official_ticket_url%NOT NULL%';
  INSERT INTO t055_report VALUES (
    'schema', 'no NOT NULL URL constraint', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'upsert_artist_atomic',
      'set_event_artists_atomic',
      'set_event_official_ticket_url'
    );
  INSERT INTO t055_report VALUES (
    'schema', '055 RPCs present', '3', v_cnt::text,
    CASE WHEN v_cnt = 3 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_event_atomic', 'publish_event', 'submit_event_for_review',
      'approve_event', 'unpublish_event', 'postpone_event', 'reschedule_event',
      'cancel_event', 'complete_event', 'decide_event_change_request',
      'propose_event_schedule_change'
    );
  INSERT INTO t055_report VALUES (
    'schema', '054/053 lifecycle RPCs still present', '11', v_cnt::text,
    CASE WHEN v_cnt = 11 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Conceptual publish-without-URL: 055 does not replace publish_event
  -- and does not add a URL requirement to publish.
  SELECT pg_get_functiondef('public.publish_event(uuid)'::regprocedure) INTO v_def;
  INSERT INTO t055_report VALUES (
    'publish', 'publish_event body has no official_ticket_url', 'absent',
    CASE WHEN v_def ILIKE '%official_ticket_url%' THEN 'present' ELSE 'absent' END,
    CASE WHEN v_def IS NOT NULL AND v_def NOT ILIKE '%official_ticket_url%' THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t055_report VALUES (
    'publish', 'publish_event still 054 catalog checks', 'present',
    CASE
      WHEN v_def ILIKE '%TICKET_ZONE_WITHOUT_TYPE%'
       AND v_def ILIKE '%OWNER_NOT_ELIGIBLE%'
      THEN 'present' ELSE 'missing'
    END,
    CASE
      WHEN v_def ILIKE '%TICKET_ZONE_WITHOUT_TYPE%'
       AND v_def ILIKE '%OWNER_NOT_ELIGIBLE%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );
  INSERT INTO t055_report VALUES (
    'publish', 'free published event may have NULL URL', 'NULL',
    coalesce((SELECT official_ticket_url FROM public.events WHERE id = v_free_pub), 'NULL'),
    CASE
      WHEN (SELECT official_ticket_url FROM public.events WHERE id = v_free_pub) IS NULL
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  SELECT pg_get_expr(c.polqual, c.polrelid) INTO v_policy_def
  FROM pg_policy c
  JOIN pg_class rel ON rel.oid = c.polrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'artists'
    AND c.polname = 'artists_select_public';
  INSERT INTO t055_report VALUES (
    'rls', 'artists_select_public uses event_is_published not is_active gate', 'event_is_published',
    coalesce(v_policy_def, 'MISSING'),
    CASE
      WHEN v_policy_def ILIKE '%event_is_published%'
       AND v_policy_def NOT ILIKE '%is_active = true%'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('artists', 'event_artists')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  INSERT INTO t055_report VALUES (
    'rls', 'no client DML policies on artists/event_artists', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  v_grant_url := has_column_privilege('authenticated', 'public.events', 'official_ticket_url', 'UPDATE');
  INSERT INTO t055_report VALUES (
    'rls', 'no client GRANT UPDATE on official_ticket_url', 'false', v_grant_url::text,
    CASE WHEN v_grant_url IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_table_privilege('authenticated', 'public.artists', 'INSERT');
  INSERT INTO t055_report VALUES (
    'rls', 'no client INSERT on artists', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_function_privilege('anon', 'public.upsert_artist_atomic(text, text, text, text, boolean, uuid)', 'execute');
  INSERT INTO t055_report VALUES (
    'auth', 'anon cannot execute upsert_artist_atomic', 'false', v_bool::text,
    CASE WHEN v_bool IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  v_bool := has_function_privilege('authenticated', 'public.set_event_official_ticket_url(uuid, text)', 'execute');
  INSERT INTO t055_report VALUES (
    'auth', 'authenticated can execute set_event_official_ticket_url', 'true', v_bool::text,
    CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END
  );

  -- Artist create: organizer PASS
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.upsert_artist_atomic('055 Artist A', '055-artist-a', 'bio a', NULL, NULL, NULL);
  EXECUTE 'RESET ROLE';
  v_artist_a := NULLIF(v_result->>'artist_id', '')::uuid;
  SELECT created_by INTO v_created FROM public.artists WHERE id = v_artist_a;
  INSERT INTO t055_report VALUES (
    'artist', 'organizer create PASS created_by=actor', 'true',
    coalesce(v_result->>'success', 'NULL') || '/' || coalesce(v_created::text, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_created = v_org THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.upsert_artist_atomic('055 Artist B', '055-artist-b');
  EXECUTE 'RESET ROLE';
  v_artist_b := NULLIF(v_result->>'artist_id', '')::uuid;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.upsert_artist_atomic('055 Artist C', '055-artist-c');
  EXECUTE 'RESET ROLE';
  v_artist_c := NULLIF(v_result->>'artist_id', '')::uuid;

  -- Organizer updates own artist
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.upsert_artist_atomic('055 Artist A Updated', '055-artist-a', 'bio2', NULL, NULL, v_artist_a);
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'artist', 'creator update PASS', 'true',
    coalesce(v_result->>'success', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Other organizer cannot update
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org2::text, true);
  v_result := public.upsert_artist_atomic('055 Hijack', '055-artist-a', NULL, NULL, NULL, v_artist_a);
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'artist', 'non-creator update FORBIDDEN', 'FORBIDDEN',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- is_active change: owner FORBIDDEN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.upsert_artist_atomic('055 Artist A Updated', '055-artist-a', 'bio2', NULL, false, v_artist_a);
  EXECUTE 'RESET ROLE';
  SELECT is_active INTO v_is_active FROM public.artists WHERE id = v_artist_a;
  INSERT INTO t055_report VALUES (
    'artist', 'creator is_active change FORBIDDEN', 'FORBIDDEN/true',
    coalesce(v_result->>'error_code', 'NULL') || '/' || coalesce(v_is_active::text, 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' AND v_is_active IS TRUE THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA can change is_active
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.upsert_artist_atomic('055 Artist A Updated', '055-artist-a', 'bio2', NULL, false, v_artist_a);
  EXECUTE 'RESET ROLE';
  SELECT is_active INTO v_is_active FROM public.artists WHERE id = v_artist_a;
  INSERT INTO t055_report VALUES (
    'artist', 'SA is_active change PASS', 'true/false',
    coalesce(v_result->>'success', 'NULL') || '/' || coalesce(v_is_active::text, 'NULL'),
    CASE WHEN v_result->>'success' = 'true' AND v_is_active IS FALSE THEN 'PASS' ELSE 'FAIL' END
  );

  -- SA re-activates for later public tests
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.upsert_artist_atomic('055 Artist A Updated', '055-artist-a', 'bio2', NULL, true, v_artist_a);
  EXECUTE 'RESET ROLE';

  -- Other organizer creates own artist
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org2::text, true);
  v_result := public.upsert_artist_atomic('055 Other Artist', '055-other-artist');
  EXECUTE 'RESET ROLE';
  v_artist_other := NULLIF(v_result->>'artist_id', '')::uuid;
  INSERT INTO t055_report VALUES (
    'artist', 'second organizer create PASS', 'true',
    coalesce(v_result->>'success', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Customer / spider / unapproved cannot create
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  v_result := public.upsert_artist_atomic('055 Customer Artist', '055-customer-artist');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'artist', 'customer create FORBIDDEN', 'FORBIDDEN',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_spider::text, true);
  v_result := public.upsert_artist_atomic('055 Spider Artist', '055-spider-artist');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'artist', 'spider no write', 'FORBIDDEN',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_unapproved::text, true);
  v_result := public.upsert_artist_atomic('055 Unapproved Artist', '055-unapproved-artist');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'artist', 'unapproved create FORBIDDEN', 'FORBIDDEN',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname ILIKE '%spider%';
  INSERT INTO t055_report VALUES (
    'security', 'no spider write RPC', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Draft owner can set event artists
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_artists_atomic(
    v_draft,
    jsonb_build_array(
      jsonb_build_object('artist_id', v_artist_a, 'role', 'headliner', 'sort_order', 2),
      jsonb_build_object('artist_id', v_artist_b, 'role', 'performer', 'sort_order', 0),
      jsonb_build_object('artist_id', v_artist_c, 'role', 'guest', 'sort_order', 1)
    )
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'event_artists', 'draft owner set PASS', 'true',
    coalesce(v_result->>'success', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT string_agg(a.slug, ',' ORDER BY ea.sort_order)
    INTO v_names
  FROM public.event_artists ea
  JOIN public.artists a ON a.id = ea.artist_id
  WHERE ea.event_id = v_draft;
  INSERT INTO t055_report VALUES (
    'event_artists', 'multi-artist sort_order B,C,A', '055-artist-b,055-artist-c,055-artist-a',
    coalesce(v_names, 'NULL'),
    CASE WHEN v_names = '055-artist-b,055-artist-c,055-artist-a' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Duplicate link rejected
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_artists_atomic(
    v_draft,
    jsonb_build_array(
      jsonb_build_object('artist_id', v_artist_a, 'sort_order', 0),
      jsonb_build_object('artist_id', v_artist_a, 'sort_order', 1)
    )
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'event_artists', 'duplicate link rejected', 'DUPLICATE_ARTIST',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'DUPLICATE_ARTIST' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Missing artist rejected
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_artists_atomic(
    v_draft,
    jsonb_build_array(
      jsonb_build_object('artist_id', 'c0550000-0000-4000-8000-000000000099', 'sort_order', 0)
    )
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'event_artists', 'missing artist rejected', 'ARTIST_NOT_FOUND',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'ARTIST_NOT_FOUND' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Non-draft owner reject (in_review + published)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_artists_atomic(
    v_review,
    jsonb_build_array(jsonb_build_object('artist_id', v_artist_a, 'sort_order', 0))
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'auth', 'owner in_review set artists FORBIDDEN', 'FORBIDDEN',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_published, 'https://tickets.kibris.test/show');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'auth', 'owner published set URL FORBIDDEN', 'FORBIDDEN',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'FORBIDDEN' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Super Admin may write after draft (NOT publish)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.set_event_artists_atomic(
    v_published,
    jsonb_build_array(
      jsonb_build_object('artist_id', v_artist_a, 'role', 'headliner', 'sort_order', 0)
    )
  );
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'auth', 'SA published set artists PASS', 'true',
    coalesce(v_result->>'success', v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  v_result := public.set_event_official_ticket_url(v_published, 'https://tickets.kibrisetkinlik.com/published');
  EXECUTE 'RESET ROLE';
  SELECT official_ticket_url, status INTO v_url, v_status FROM public.events WHERE id = v_published;
  INSERT INTO t055_report VALUES (
    'auth', 'SA published set URL PASS status unchanged', 'published/https://tickets.kibrisetkinlik.com/published',
    coalesce(v_status, 'NULL') || '/' || coalesce(v_url, 'NULL'),
    CASE
      WHEN v_status = 'published' AND v_url = 'https://tickets.kibrisetkinlik.com/published'
      THEN 'PASS' ELSE 'FAIL'
    END
  );

  -- Draft owner URL: invalid reject, null ok, empty→NULL, valid ok
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://example.com/tickets');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', 'example.com rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://example.org/x');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', 'example.org rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'http://localhost/tickets');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', 'localhost rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://invalid');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', 'invalid host rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'not-a-url');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', 'non-http rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://tickets.example.com/tickets');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', 'tickets.example.com rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://tickets.kibris.test/draft');
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'url', '.test host rejected', 'INVALID_URL',
    coalesce(v_result->>'error_code', 'NULL'),
    CASE WHEN v_result->>'error_code' = 'INVALID_URL' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://tickets.kibrisetkinlik.com/draft');
  EXECUTE 'RESET ROLE';
  SELECT official_ticket_url INTO v_url FROM public.events WHERE id = v_draft;
  INSERT INTO t055_report VALUES (
    'url', 'draft owner valid https PASS', 'https://tickets.kibrisetkinlik.com/draft',
    coalesce(v_url, v_result->>'error_code', 'NULL'),
    CASE WHEN v_url = 'https://tickets.kibrisetkinlik.com/draft' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'http://tickets.kibrisetkinlik.com/http-ok');
  EXECUTE 'RESET ROLE';
  SELECT official_ticket_url INTO v_url FROM public.events WHERE id = v_draft;
  INSERT INTO t055_report VALUES (
    'url', 'draft owner valid http PASS', 'http://tickets.kibrisetkinlik.com/http-ok',
    coalesce(v_url, v_result->>'error_code', 'NULL'),
    CASE WHEN v_url = 'http://tickets.kibrisetkinlik.com/http-ok' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, NULL);
  EXECUTE 'RESET ROLE';
  SELECT official_ticket_url INTO v_url FROM public.events WHERE id = v_draft;
  INSERT INTO t055_report VALUES (
    'url', 'null URL ok (clears)', 'NULL/true',
    coalesce(v_url, 'NULL') || '/' || coalesce(v_result->>'success', 'NULL'),
    CASE WHEN v_url IS NULL AND v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, '');
  EXECUTE 'RESET ROLE';
  SELECT official_ticket_url INTO v_url FROM public.events WHERE id = v_draft;
  INSERT INTO t055_report VALUES (
    'url', 'empty string stores as NULL', 'NULL/true',
    coalesce(v_url, 'NULL') || '/' || coalesce(v_result->>'success', 'NULL'),
    CASE WHEN v_url IS NULL AND v_result->>'success' = 'true' THEN 'PASS' ELSE 'FAIL' END
  );

  -- Restore draft URL for public-visibility contrast
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
  v_result := public.set_event_official_ticket_url(v_draft, 'https://tickets.kibrisetkinlik.com/draft');
  EXECUTE 'RESET ROLE';

  -- Public URL on published only; draft artists must not leak
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_draft;
  SELECT count(*) INTO v_cnt2 FROM public.events WHERE id = v_published AND official_ticket_url IS NOT NULL;
  INSERT INTO t055_report VALUES (
    'public', 'draft event hidden from anon', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t055_report VALUES (
    'public', 'published URL visible to anon', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.artists
  WHERE id = v_artist_b;
  SELECT count(*) INTO v_cnt2
  FROM public.artists
  WHERE id = v_artist_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t055_report VALUES (
    'public', 'draft-only artist does not leak to anon', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );
  INSERT INTO t055_report VALUES (
    'public', 'published-linked artist visible to anon', '1', v_cnt2::text,
    CASE WHEN v_cnt2 = 1 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Client DML reject
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
    INSERT INTO public.artists (name, slug, created_by)
    VALUES ('055 Client Insert', '055-client-insert', v_org);
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'rls', 'client INSERT artists rejected', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'rls', 'client INSERT artists rejected', 'denied', SQLERRM, 'PASS'
    );
  END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
    INSERT INTO public.event_artists (event_id, artist_id)
    VALUES (v_draft, v_artist_other);
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'rls', 'client INSERT event_artists rejected', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'rls', 'client INSERT event_artists rejected', 'denied', SQLERRM, 'PASS'
    );
  END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_org::text, true);
    UPDATE public.events
    SET official_ticket_url = 'https://tickets.kibris.test/hack'
    WHERE id = v_draft;
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'rls', 'client UPDATE official_ticket_url rejected', 'denied', 'updated', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'rls', 'client UPDATE official_ticket_url rejected', 'denied', SQLERRM, 'PASS'
    );
  END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_sa, 'ARTIST_UPSERTED', 'artist', v_artist_a);
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', 'inserted', 'FAIL'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t055_report VALUES (
      'audit', 'client cannot forge audit INSERT', 'denied', SQLERRM, 'PASS'
    );
  END;

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'ARTIST_UPSERTED' AND actor_id = v_org;
  INSERT INTO t055_report VALUES (
    'audit', 'ARTIST_UPSERTED written', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_ARTISTS_UPDATED' AND target_id = v_draft;
  INSERT INTO t055_report VALUES (
    'audit', 'EVENT_ARTISTS_UPDATED written', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action = 'EVENT_OFFICIAL_TICKET_URL_SET' AND target_id IN (v_draft, v_published);
  INSERT INTO t055_report VALUES (
    'audit', 'EVENT_OFFICIAL_TICKET_URL_SET written', '>=1', v_cnt::text,
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END
  );

  SELECT count(*) INTO v_cnt
  FROM public.admin_audit_log
  WHERE action IN (
    'EVENT_PUBLISHED', 'EVENT_SUBMITTED', 'EVENT_APPROVED', 'EVENT_UNPUBLISHED'
  ) AND actor_id IN (v_sa, v_org);
  INSERT INTO t055_report VALUES (
    'audit', '055 does not reuse 054 action names', '0', v_cnt::text,
    CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END
  );

  -- Cleanup
  DELETE FROM public.admin_audit_log
  WHERE actor_id IN (v_sa, v_org, v_vo, v_customer, v_unapproved, v_org2, v_spider)
     OR target_id IN (v_draft, v_review, v_published, v_free_pub, v_artist_a, v_artist_b, v_artist_c, v_artist_other);
  DELETE FROM public.event_artists
  WHERE event_id IN (v_draft, v_review, v_published, v_free_pub)
     OR artist_id IN (v_artist_a, v_artist_b, v_artist_c, v_artist_other);
  DELETE FROM public.events
  WHERE id IN (v_draft, v_review, v_published, v_free_pub);
  DELETE FROM public.artists
  WHERE id IN (v_artist_a, v_artist_b, v_artist_c, v_artist_other)
     OR slug LIKE '055-%';
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.organizer_profiles WHERE profile_id IN (v_org, v_org2);
  DELETE FROM public.venue_owner_profiles WHERE profile_id = v_vo;
  DELETE FROM public.super_admin_profiles WHERE profile_id = v_sa;
  DELETE FROM public.profiles WHERE id IN (v_sa, v_org, v_vo, v_customer, v_unapproved, v_org2, v_spider);
  DELETE FROM auth.users WHERE id IN (v_sa, v_org, v_vo, v_customer, v_unapproved, v_org2, v_spider);
END $$;

SELECT section, test_name, expected, actual, result
FROM t055_report
ORDER BY section, test_name;
