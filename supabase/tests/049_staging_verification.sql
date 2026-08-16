-- 049 Staging Verification Tests — STAGING ONLY (nksctgxmkymmiubkrohf)
-- Covers: seed (6 districts + İskele), schema, RLS, FK, backfill, idempotency, security

-- Pre-cleanup test UUIDs
DELETE FROM public.event_locations WHERE event_id IN (
  'a9000001-0001-4001-8001-000000000001',
  'a9000002-0002-4002-8002-000000000002',
  'a9000003-0003-4003-8003-000000000003'
);
DELETE FROM public.events WHERE id IN (
  'a9000001-0001-4001-8001-000000000001',
  'a9000002-0002-4002-8002-000000000002',
  'a9000003-0003-4003-8003-000000000003'
);
DELETE FROM public.venues WHERE id IN (
  'b9000001-0001-4001-8001-000000000001',
  'b9000002-0002-4002-8002-000000000002',
  'b9000003-0003-4003-8003-000000000003',
  'b9000004-0004-4004-8004-000000000004',
  'b9000005-0005-4005-8005-000000000005',
  'b9000006-0006-4006-8006-000000000006',
  'b9000007-0007-4007-8007-000000000007'
);
DELETE FROM public.profiles WHERE id = 'c9000001-0001-4001-8001-000000000001';
DELETE FROM auth.users WHERE id = 'c9000001-0001-4001-8001-000000000001';

CREATE TEMP TABLE t049_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_user uuid := 'c9000001-0001-4001-8001-000000000001';
  v_venue_lefkosa uuid := 'b9000001-0001-4001-8001-000000000001';
  v_venue_girne uuid := 'b9000002-0002-4002-8002-000000000002';
  v_venue_gazimagusa uuid := 'b9000003-0003-4003-8003-000000000003';
  v_venue_guzelyurt uuid := 'b9000004-0004-4004-8004-000000000004';
  v_venue_lefke uuid := 'b9000005-0005-4005-8005-000000000005';
  v_venue_iskele uuid := 'b9000006-0006-4006-8006-000000000006';
  v_venue_ambiguous uuid := 'b9000007-0007-4007-8007-000000000007';
  v_event uuid := 'a9000001-0001-4001-8001-000000000001';
  v_event_el uuid := 'a9000002-0002-4002-8002-000000000002';
  v_event_venue uuid := 'a9000003-0003-4003-8003-000000000003';
  v_instance uuid;
  v_cnt int;
  v_iskele_id uuid;
  v_bool boolean;
  v_code text;
  v_name_tr text;
  v_districts_before int;
  v_districts_after int;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;

  -- ============================================================
  -- SEED: 6 canonical districts
  -- ============================================================
  SELECT count(*) INTO v_cnt FROM public.kktc_districts WHERE is_active = true;
  INSERT INTO t049_report VALUES
    ('seed', 'COUNT active canonical districts', '6', v_cnt::text, CASE WHEN v_cnt = 6 THEN 'PASS' ELSE 'FAIL' END);

  INSERT INTO t049_report
  SELECT 'seed', 'District exists: ' || name_tr, 'present', code,
    CASE WHEN code IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  FROM public.kktc_districts
  WHERE code IN ('lefkosa', 'girne', 'gazimagusa', 'guzelyurt', 'lefke', 'iskele')
  ORDER BY sort_order;

  SELECT code, name_tr INTO v_code, v_name_tr
  FROM public.kktc_districts WHERE code = 'iskele';

  INSERT INTO t049_report VALUES
    ('seed', 'İskele code', 'iskele', COALESCE(v_code, 'NULL'), CASE WHEN v_code = 'iskele' THEN 'PASS' ELSE 'FAIL' END),
    ('seed', 'İskele name_tr', 'İskele', COALESCE(v_name_tr, 'NULL'), CASE WHEN v_name_tr = 'İskele' THEN 'PASS' ELSE 'FAIL' END);

  SELECT id INTO v_iskele_id FROM public.kktc_districts WHERE code = 'iskele';

  -- ============================================================
  -- SCHEMA
  -- ============================================================
  SELECT count(*) INTO v_cnt FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'kktc_districts';
  INSERT INTO t049_report VALUES ('schema', 'kktc_districts table exists', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'district_id';
  INSERT INTO t049_report VALUES ('schema', 'venues.district_id column', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'event_locations' AND column_name = 'district_id';
  INSERT INTO t049_report VALUES ('schema', 'event_locations.district_id column', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'district_id';
  INSERT INTO t049_report VALUES ('schema', 'events.district_id NOT added', '0', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'city';
  INSERT INTO t049_report VALUES ('schema', 'venues.city preserved', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'region';
  INSERT INTO t049_report VALUES ('schema', 'venues.region preserved', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- FK / indexes
  -- ============================================================
  SELECT count(*) INTO v_cnt FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'venues'
    AND tc.constraint_name LIKE '%district%';
  INSERT INTO t049_report VALUES ('fk', 'venues district_id FK', '>=1', v_cnt::text, CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'venues_district_id_idx';
  INSERT INTO t049_report VALUES ('fk', 'venues_district_id_idx', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'kktc_districts_code_unique';
  INSERT INTO t049_report VALUES ('fk', 'kktc_districts_code_unique index', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- RLS
  -- ============================================================
  SELECT relrowsecurity INTO v_bool FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'kktc_districts';
  INSERT INTO t049_report VALUES ('rls', 'kktc_districts RLS enabled', 'true', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'kktc_districts' AND policyname = 'kktc_districts_select_public';
  INSERT INTO t049_report VALUES ('rls', 'kktc_districts_select_public policy', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'kktc_districts' AND policyname LIKE '%insert%';
  INSERT INTO t049_report VALUES ('rls', 'kktc_districts insert super_admin policy', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- Public SELECT (anon)
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_cnt FROM public.kktc_districts;
  EXECUTE 'RESET ROLE';
  INSERT INTO t049_report VALUES ('security', 'ANON SELECT all districts', '6', v_cnt::text, CASE WHEN v_cnt = 6 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- Backfill fixtures + mapping tests
  -- ============================================================
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_user, v_instance, 'authenticated', 'authenticated', '049-test@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now());

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES (v_user, '049-test@staging.test', 'organizer', 'approved', '049 Test User')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.venues (id, owner_id, name, status, city, region, district_id)
  VALUES
    (v_venue_lefkosa, v_user, 'Venue Lefkosa', 'active', 'Lefkoşa', NULL, NULL),
    (v_venue_girne, v_user, 'Venue Girne', 'active', 'Girne', NULL, NULL),
    (v_venue_gazimagusa, v_user, 'Venue Magosa', 'active', 'Gazimağusa', NULL, NULL),
    (v_venue_guzelyurt, v_user, 'Venue Guzelyurt', 'active', 'Güzelyurt', NULL, NULL),
    (v_venue_lefke, v_user, 'Venue Lefke', 'active', 'Lefke', NULL, NULL),
    (v_venue_iskele, v_user, 'Venue Iskele', 'active', 'İskele', NULL, NULL),
    (v_venue_ambiguous, v_user, 'Venue Ambiguous', 'active', 'Girne', 'Lefkoşa', NULL);

  -- Run backfill logic (idempotent)
  UPDATE public.venues AS v
  SET district_id = d.id
  FROM public.kktc_districts AS d
  WHERE v.district_id IS NULL
    AND public.kktc_resolve_district_code(v.city, v.region) = d.code
    AND v.id IN (v_venue_lefkosa, v_venue_girne, v_venue_gazimagusa, v_venue_guzelyurt, v_venue_lefke, v_venue_iskele, v_venue_ambiguous);

  INSERT INTO t049_report
  SELECT 'backfill', 'Venue mapped: ' || v.name, d.code, COALESCE(d.code, 'NULL'),
    CASE WHEN v.district_id IS NOT NULL AND d.code IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  FROM public.venues v
  LEFT JOIN public.kktc_districts d ON d.id = v.district_id
  WHERE v.id IN (v_venue_lefkosa, v_venue_girne, v_venue_gazimagusa, v_venue_guzelyurt, v_venue_lefke, v_venue_iskele)
  ORDER BY v.name;

  SELECT district_id IS NULL INTO v_bool FROM public.venues WHERE id = v_venue_ambiguous;
  INSERT INTO t049_report VALUES ('backfill', 'Ambiguous city/region left unmapped', 'NULL district_id', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  SELECT public.kktc_district_code_from_text('İskele') INTO v_code;
  INSERT INTO t049_report VALUES ('backfill', 'Text map İskele → iskele', 'iskele', COALESCE(v_code, 'NULL'), CASE WHEN v_code = 'iskele' THEN 'PASS' ELSE 'FAIL' END);

  SELECT public.kktc_district_code_from_text('ISKELE') INTO v_code;
  INSERT INTO t049_report VALUES ('backfill', 'Text map ISKELE → iskele', 'iskele', COALESCE(v_code, 'NULL'), CASE WHEN v_code = 'iskele' THEN 'PASS' ELSE 'FAIL' END);

  -- event_locations backfill via venue
  INSERT INTO public.events (id, owner_id, venue_id, title, category, status, starts_at)
  VALUES (v_event_venue, v_user, v_venue_iskele, 'Event Venue District', 'concert', 'draft', now() + interval '7 days');

  INSERT INTO public.event_locations (event_id, city, region, district_id)
  VALUES (v_event_venue, 'İskele', NULL, NULL);

  UPDATE public.event_locations AS el
  SET district_id = v.district_id
  FROM public.events AS e
  JOIN public.venues AS v ON v.id = e.venue_id
  WHERE el.event_id = e.id AND el.district_id IS NULL AND v.district_id IS NOT NULL
    AND el.event_id = v_event_venue;

  SELECT d.code INTO v_code
  FROM public.event_locations el
  JOIN public.kktc_districts d ON d.id = el.district_id
  WHERE el.event_id = v_event_venue;

  INSERT INTO t049_report VALUES ('backfill', 'event_locations copied from venue', 'iskele', COALESCE(v_code, 'NULL'), CASE WHEN v_code = 'iskele' THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- Idempotency
  -- ============================================================
  SELECT count(*) INTO v_districts_before FROM public.kktc_districts;

  INSERT INTO public.kktc_districts (code, name_tr, name_en, sort_order)
  VALUES ('iskele', 'Dup', 'Dup', 99)
  ON CONFLICT (code) DO NOTHING;

  SELECT count(*) INTO v_districts_after FROM public.kktc_districts;
  INSERT INTO t049_report VALUES ('idempotency', 'Seed re-run no duplicate districts', v_districts_before::text, v_districts_after::text,
    CASE WHEN v_districts_after = v_districts_before THEN 'PASS' ELSE 'FAIL' END);

  UPDATE public.venues AS v
  SET district_id = d.id
  FROM public.kktc_districts AS d
  WHERE v.district_id IS NULL
    AND public.kktc_resolve_district_code(v.city, v.region) = d.code
    AND v.id IN (v_venue_lefkosa, v_venue_girne, v_venue_gazimagusa, v_venue_guzelyurt, v_venue_lefke, v_venue_iskele);

  SELECT count(*) INTO v_cnt FROM public.venues
  WHERE id IN (v_venue_lefkosa, v_venue_girne, v_venue_gazimagusa, v_venue_guzelyurt, v_venue_lefke, v_venue_iskele)
    AND district_id IS NULL;
  INSERT INTO t049_report VALUES ('idempotency', 'Backfill re-run still mapped', '0 unmapped', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- Helper / RPC exists
  -- ============================================================
  SELECT count(*) INTO v_cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'kktc_district_code_from_text';
  INSERT INTO t049_report VALUES ('schema', 'kktc_district_code_from_text function', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'upsert_event_location_atomic'
    AND pg_get_function_identity_arguments(p.oid) LIKE '%uuid%uuid%';
  INSERT INTO t049_report VALUES ('schema', 'upsert_event_location_atomic 8-arg signature', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- Cleanup fixtures
  -- ============================================================
  DELETE FROM public.event_locations WHERE event_id IN (v_event, v_event_el, v_event_venue);
  DELETE FROM public.events WHERE id IN (v_event, v_event_el, v_event_venue);
  DELETE FROM public.venues WHERE id IN (
    v_venue_lefkosa, v_venue_girne, v_venue_gazimagusa, v_venue_guzelyurt,
    v_venue_lefke, v_venue_iskele, v_venue_ambiguous
  );
  DELETE FROM public.profiles WHERE id = v_user;
  DELETE FROM auth.users WHERE id = v_user;

END $$;

SELECT section, test_name, expected, actual, result
FROM t049_report
ORDER BY section, test_name;
