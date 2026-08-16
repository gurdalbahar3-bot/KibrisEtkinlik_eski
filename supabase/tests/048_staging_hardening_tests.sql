-- 048 Staging Hardening Tests — STAGING ONLY (nksctgxmkymmiubkrohf)
-- Covers: org admin/member, customer order RLS, realistic backfill, idempotency, cross-org, membership RLS

-- ============================================================
-- Pre-cleanup all test UUIDs
-- ============================================================
DELETE FROM public.order_items WHERE order_id IN ('0a000001-0001-4001-8001-000000000001');
DELETE FROM public.orders WHERE id IN ('0a000001-0001-4001-8001-000000000001');
DELETE FROM public.event_staff_permissions WHERE event_id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);
DELETE FROM public.staff_assignments WHERE id = '66666666-6666-4666-8666-666666666666';
DELETE FROM public.events WHERE id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);
DELETE FROM public.venues WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);
DELETE FROM public.organization_memberships WHERE profile_id IN (
  'a0000001-0001-4001-8001-000000000001',
  'b0000002-0002-4002-8002-000000000002',
  'a0000005-0005-4005-8005-000000000005',
  'a0000006-0006-4006-8006-000000000006',
  'd0000004-0004-4004-8004-000000000004'
);
DELETE FROM public.organizer_profiles WHERE profile_id IN (
  'a0000001-0001-4001-8001-000000000001',
  'b0000002-0002-4002-8002-000000000002'
);
DELETE FROM public.venue_owner_profiles WHERE profile_id IN (
  'a0000001-0001-4001-8001-000000000001',
  'b0000002-0002-4002-8002-000000000002'
);
DELETE FROM public.super_admin_profiles WHERE profile_id = 'd0000004-0004-4004-8004-000000000004';
DELETE FROM public.organizations WHERE created_from_profile_id IN (
  'a0000001-0001-4001-8001-000000000001',
  'b0000002-0002-4002-8002-000000000002'
);
DELETE FROM public.profiles WHERE id IN (
  'a0000001-0001-4001-8001-000000000001',
  'b0000002-0002-4002-8002-000000000002',
  'a0000005-0005-4005-8005-000000000005',
  'a0000006-0006-4006-8006-000000000006',
  'ca000001-0001-4001-8001-000000000001',
  'cb000002-0002-4002-8002-000000000002',
  'd0000004-0004-4004-8004-000000000004'
);
DELETE FROM auth.users WHERE id IN (
  'a0000001-0001-4001-8001-000000000001',
  'b0000002-0002-4002-8002-000000000002',
  'a0000005-0005-4005-8005-000000000005',
  'a0000006-0006-4006-8006-000000000006',
  'ca000001-0001-4001-8001-000000000001',
  'cb000002-0002-4002-8002-000000000002',
  'd0000004-0004-4004-8004-000000000004'
);

CREATE TEMP TABLE t048_hardening_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_user_a uuid := 'a0000001-0001-4001-8001-000000000001';
  v_user_b uuid := 'b0000002-0002-4002-8002-000000000002';
  v_user_admin uuid := 'a0000006-0006-4006-8006-000000000006';
  v_user_member uuid := 'a0000005-0005-4005-8005-000000000005';
  v_customer_a uuid := 'ca000001-0001-4001-8001-000000000001';
  v_customer_b uuid := 'cb000002-0002-4002-8002-000000000002';
  v_super uuid := 'd0000004-0004-4004-8004-000000000004';
  v_venue_a uuid := '11111111-1111-4111-8111-111111111111';
  v_venue_b uuid := '22222222-2222-4222-8222-222222222222';
  v_event_a uuid := '33333333-3333-4333-8333-333333333333';
  v_event_a_pub uuid := '44444444-4444-4444-8444-444444444444';
  v_event_b uuid := '55555555-5555-4555-8555-555555555555';
  v_order_a uuid := '0a000001-0001-4001-8001-000000000001';
  v_org_a uuid;
  v_org_b uuid;
  v_role_org_owner uuid;
  v_role_org_admin uuid;
  v_role_org_member uuid;
  v_instance uuid;
  v_cnt int;
  v_cnt2 int;
  v_bool boolean;
  v_orgs_before bigint;
  v_orgs_after bigint;
  v_mem_before bigint;
  v_mem_after bigint;
BEGIN
  SELECT id INTO v_role_org_owner FROM public.roles WHERE code = 'org_owner';
  SELECT id INTO v_role_org_admin FROM public.roles WHERE code = 'org_admin';
  SELECT id INTO v_role_org_member FROM public.roles WHERE code = 'org_member';
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;

  -- ============================================================
  -- Setup auth + profiles (pre-backfill, no organizations yet)
  -- ============================================================
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_a, v_instance, 'authenticated', 'authenticated', 'user-a-hardening@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_user_b, v_instance, 'authenticated', 'authenticated', 'user-b-hardening@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_user_admin, v_instance, 'authenticated', 'authenticated', 'user-admin@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_user_member, v_instance, 'authenticated', 'authenticated', 'user-member@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer_a, v_instance, 'authenticated', 'authenticated', 'customer-a@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer_b, v_instance, 'authenticated', 'authenticated', 'customer-b@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_super, v_instance, 'authenticated', 'authenticated', 'super-hardening@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now());

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_user_a, 'user-a-hardening@staging.test', 'organizer', 'approved', 'User A'),
    (v_user_b, 'user-b-hardening@staging.test', 'organizer', 'approved', 'User B'),
    (v_user_admin, 'user-admin@staging.test', 'organizer', 'approved', 'User Admin'),
    (v_user_member, 'user-member@staging.test', 'organizer', 'approved', 'User Member'),
    (v_customer_a, 'customer-a@staging.test', 'customer', 'approved', 'Customer A'),
    (v_customer_b, 'customer-b@staging.test', 'customer', 'approved', 'Customer B'),
    (v_super, 'super-hardening@staging.test', 'organizer', 'approved', 'Super Admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    account_type = EXCLUDED.account_type,
    verification_status = EXCLUDED.verification_status,
    full_name = EXCLUDED.full_name;

  INSERT INTO public.organizer_profiles (profile_id, organization_name)
  VALUES (v_user_a, 'Org A Name'), (v_user_b, 'Org B Name');

  INSERT INTO public.venue_owner_profiles (profile_id, business_name)
  VALUES (v_user_a, 'Venue Owner A Biz'), (v_user_b, 'Venue Owner B Biz');

  INSERT INTO public.venues (id, owner_id, name, status, organization_id)
  VALUES
    (v_venue_a, v_user_a, 'Venue A Hardening', 'active', NULL),
    (v_venue_b, v_user_b, 'Venue B Hardening', 'active', NULL);

  INSERT INTO public.events (id, owner_id, venue_id, title, category, status, starts_at, organization_id)
  VALUES
    (v_event_a, v_user_a, v_venue_a, 'Event A Hardening', 'concert', 'draft', now() + interval '7 days', NULL),
    (v_event_a_pub, v_user_a, v_venue_a, 'Event A Published', 'concert', 'published', now() + interval '8 days', NULL),
    (v_event_b, v_user_b, v_venue_b, 'Event B Hardening', 'concert', 'draft', now() + interval '9 days', NULL);

  INSERT INTO public.super_admin_profiles (profile_id) VALUES (v_super);

  -- ============================================================
  -- Realistic backfill (048 §6 logic)
  -- ============================================================
  SELECT count(*) INTO v_orgs_before FROM public.organizations
  WHERE created_from_profile_id IN (v_user_a, v_user_b);
  SELECT count(*) INTO v_mem_before FROM public.organization_memberships om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE o.created_from_profile_id IN (v_user_a, v_user_b);

  INSERT INTO public.organizations (slug, name, status, created_from_profile_id, created_at, updated_at)
  SELECT
    public.organization_slug_for_profile(op.profile_id),
    COALESCE(orgp.organization_name, vop.business_name, p.full_name, p.email, 'Organization'),
    'active', op.profile_id, now(), now()
  FROM (
    SELECT DISTINCT owner_id AS profile_id FROM public.events WHERE owner_id IN (v_user_a, v_user_b)
    UNION SELECT DISTINCT owner_id FROM public.venues WHERE owner_id IN (v_user_a, v_user_b)
    UNION SELECT profile_id FROM public.organizer_profiles WHERE profile_id IN (v_user_a, v_user_b)
    UNION SELECT profile_id FROM public.venue_owner_profiles WHERE profile_id IN (v_user_a, v_user_b)
  ) op
  JOIN public.profiles p ON p.id = op.profile_id
  LEFT JOIN public.organizer_profiles orgp ON orgp.profile_id = op.profile_id
  LEFT JOIN public.venue_owner_profiles vop ON vop.profile_id = op.profile_id
  ON CONFLICT (created_from_profile_id) DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, profile_id, role_id, status, joined_at, created_at)
  SELECT o.id, o.created_from_profile_id, v_role_org_owner, 'active', now(), now()
  FROM public.organizations o
  WHERE o.created_from_profile_id IN (v_user_a, v_user_b)
  ON CONFLICT (organization_id, profile_id) DO NOTHING;

  UPDATE public.events e SET organization_id = o.id
  FROM public.organizations o
  WHERE e.organization_id IS NULL AND o.created_from_profile_id = e.owner_id
    AND e.owner_id IN (v_user_a, v_user_b);

  UPDATE public.venues v SET organization_id = o.id
  FROM public.organizations o
  WHERE v.organization_id IS NULL AND o.created_from_profile_id = v.owner_id
    AND v.owner_id IN (v_user_a, v_user_b);

  UPDATE public.organizer_profiles op SET organization_id = o.id
  FROM public.organizations o
  WHERE op.organization_id IS NULL AND o.created_from_profile_id = op.profile_id
    AND op.profile_id IN (v_user_a, v_user_b);

  SELECT id INTO v_org_a FROM public.organizations WHERE created_from_profile_id = v_user_a;
  SELECT id INTO v_org_b FROM public.organizations WHERE created_from_profile_id = v_user_b;

  SELECT count(*) INTO v_orgs_after FROM public.organizations
  WHERE created_from_profile_id IN (v_user_a, v_user_b);
  SELECT count(*) INTO v_mem_after FROM public.organization_memberships om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE o.created_from_profile_id IN (v_user_a, v_user_b);

  INSERT INTO t048_hardening_report VALUES
    ('G', 'Backfill USER_A org count', '1', (SELECT count(*)::text FROM public.organizations WHERE created_from_profile_id = v_user_a), CASE WHEN (SELECT count(*) FROM public.organizations WHERE created_from_profile_id = v_user_a) = 1 THEN 'PASS' ELSE 'FAIL' END),
    ('G', 'Backfill USER_B org count', '1', (SELECT count(*)::text FROM public.organizations WHERE created_from_profile_id = v_user_b), CASE WHEN (SELECT count(*) FROM public.organizations WHERE created_from_profile_id = v_user_b) = 1 THEN 'PASS' ELSE 'FAIL' END),
    ('G', 'Backfill USER_A event org link', 'ORG_A', (SELECT organization_id::text FROM public.events WHERE id = v_event_a), CASE WHEN (SELECT organization_id FROM public.events WHERE id = v_event_a) = v_org_a THEN 'PASS' ELSE 'FAIL' END),
    ('G', 'Backfill USER_A venue org link', 'ORG_A', (SELECT organization_id::text FROM public.venues WHERE id = v_venue_a), CASE WHEN (SELECT organization_id FROM public.venues WHERE id = v_venue_a) = v_org_a THEN 'PASS' ELSE 'FAIL' END),
    ('G', 'Backfill USER_A organizer_profile org link', 'ORG_A', (SELECT organization_id::text FROM public.organizer_profiles WHERE profile_id = v_user_a), CASE WHEN (SELECT organization_id FROM public.organizer_profiles WHERE profile_id = v_user_a) = v_org_a THEN 'PASS' ELSE 'FAIL' END),
    ('G', 'Backfill USER_B event org link', 'ORG_B', (SELECT organization_id::text FROM public.events WHERE id = v_event_b), CASE WHEN (SELECT organization_id FROM public.events WHERE id = v_event_b) = v_org_b THEN 'PASS' ELSE 'FAIL' END),
    ('G', 'Backfill orgs not shared', 'ORG_A != ORG_B', v_org_a::text || ' vs ' || v_org_b::text, CASE WHEN v_org_a IS NOT NULL AND v_org_b IS NOT NULL AND v_org_a <> v_org_b THEN 'PASS' ELSE 'FAIL' END);

  -- Idempotency second run
  INSERT INTO public.organizations (slug, name, status, created_from_profile_id, created_at, updated_at)
  SELECT public.organization_slug_for_profile(op.profile_id), 'Dup', 'active', op.profile_id, now(), now()
  FROM (SELECT v_user_a AS profile_id UNION SELECT v_user_b) op
  ON CONFLICT (created_from_profile_id) DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, profile_id, role_id, status, joined_at, created_at)
  SELECT o.id, o.created_from_profile_id, v_role_org_owner, 'active', now(), now()
  FROM public.organizations o WHERE o.created_from_profile_id IN (v_user_a, v_user_b)
  ON CONFLICT (organization_id, profile_id) DO NOTHING;

  INSERT INTO t048_hardening_report VALUES
    ('H', 'Idempotency org count unchanged', v_orgs_after::text, (SELECT count(*)::text FROM public.organizations WHERE created_from_profile_id IN (v_user_a, v_user_b)), CASE WHEN (SELECT count(*) FROM public.organizations WHERE created_from_profile_id IN (v_user_a, v_user_b)) = v_orgs_after THEN 'PASS' ELSE 'FAIL' END),
    ('H', 'Idempotency membership count unchanged', v_mem_after::text, (SELECT count(*)::text FROM public.organization_memberships om JOIN public.organizations o ON o.id = om.organization_id WHERE o.created_from_profile_id IN (v_user_a, v_user_b)), CASE WHEN (SELECT count(*) FROM public.organization_memberships om JOIN public.organizations o ON o.id = om.organization_id WHERE o.created_from_profile_id IN (v_user_a, v_user_b)) = v_mem_after THEN 'PASS' ELSE 'FAIL' END);

  -- Add org admin + member after backfill
  INSERT INTO public.organization_memberships (organization_id, profile_id, role_id, status, joined_at, created_at)
  VALUES
    (v_org_a, v_user_admin, v_role_org_admin, 'active', now(), now()),
    (v_org_a, v_user_member, v_role_org_member, 'active', now(), now())
  ON CONFLICT (organization_id, profile_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active';

  -- Customer order fixture
  INSERT INTO public.orders (id, customer_id, event_id, status, subtotal_amount, total_amount, currency, expires_at, amount_paid_online, amount_remaining, amount_due_now)
  VALUES (v_order_a, v_customer_a, v_event_a, 'pending_payment', 100, 100, 'TRY', now() + interval '1 hour', 0, 100, 100);

  -- ============================================================
  -- A/B/C: can_manage_event org roles
  -- ============================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_admin::text, true);
  SELECT public.can_manage_event(v_event_a) INTO v_bool;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('B', 'USER_ADMIN can_manage_event ORG_A event', 'TRUE', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_member::text, true);
  SELECT public.can_manage_event(v_event_a) INTO v_bool;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('C', 'USER_MEMBER can_manage_event ORG_A event', 'FALSE', v_bool::text, CASE WHEN NOT v_bool THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  SELECT public.can_manage_event(v_event_a) INTO v_bool;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('D', 'USER_B cross-org can_manage_event ORG_A event', 'FALSE', v_bool::text, CASE WHEN NOT v_bool THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT public.can_manage_event(v_event_a) INTO v_bool;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('A', 'USER_A org_owner can_manage_event own event', 'TRUE', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- F: Customer order RLS
  -- ============================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  SELECT count(*) INTO v_cnt FROM public.orders WHERE id = v_order_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('F', 'CUSTOMER_A SELECT own order', 'ALLOWED (1)', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
  SELECT count(*) INTO v_cnt FROM public.orders WHERE id = v_order_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('F', 'CUSTOMER_B SELECT CUSTOMER_A order', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.orders WHERE id = v_order_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('F', 'ANON SELECT private order', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- I: Owner compatibility after backfill
  -- ============================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT public.owns_event(v_event_a) INTO v_bool;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('I', 'USER_A owns_event after backfill', 'TRUE', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT public.owns_venue(v_venue_a) INTO v_bool;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('I', 'USER_A owns_venue after backfill', 'TRUE', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- D/E: Cross-org + membership RLS after real backfill
  -- ============================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT count(*) INTO v_cnt FROM public.organizations WHERE id = v_org_b;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('D', 'USER_A organizations SELECT ORG_B', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  SELECT count(*) INTO v_cnt FROM public.organizations WHERE id = v_org_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('D', 'USER_B organizations SELECT ORG_A', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT count(*) INTO v_cnt FROM public.organization_memberships WHERE organization_id = v_org_a AND profile_id = v_user_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('E', 'USER_A membership SELECT own ORG_A', 'ALLOWED (1)', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT count(*) INTO v_cnt FROM public.organization_memberships WHERE organization_id = v_org_b;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('E', 'USER_A membership SELECT ORG_B rows', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  SELECT count(*) INTO v_cnt FROM public.organization_memberships WHERE organization_id = v_org_b AND profile_id = v_user_b;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('E', 'USER_B membership SELECT own ORG_B', 'ALLOWED (1)', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  SELECT count(*) INTO v_cnt FROM public.organization_memberships WHERE organization_id = v_org_a;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('E', 'USER_B membership SELECT ORG_A rows', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_b;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('D', 'USER_A events SELECT ORG_B event', 'DENIED (0)', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- J/H: RLS recursion
  -- ============================================================
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    SELECT public.can_access_organization(v_org_a) INTO v_bool;
    EXECUTE 'RESET ROLE';
    INSERT INTO t048_hardening_report VALUES ('J', 'can_access_organization no recursion', 'TRUE', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t048_hardening_report VALUES ('J', 'can_access_organization no recursion', 'TRUE', SQLERRM, 'FAIL');
  END;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    SELECT public.can_manage_organization(v_org_a) INTO v_bool;
    EXECUTE 'RESET ROLE';
    INSERT INTO t048_hardening_report VALUES ('J', 'can_manage_organization no recursion', 'TRUE', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t048_hardening_report VALUES ('J', 'can_manage_organization no recursion', 'TRUE', SQLERRM, 'FAIL');
  END;

  -- ============================================================
  -- K/L: Public + super admin
  -- ============================================================
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_cnt FROM public.events WHERE id = v_event_a_pub;
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('K', 'ANON published event SELECT', 'ALLOWED (1)', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
  SELECT count(*) INTO v_cnt FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  EXECUTE 'RESET ROLE';
  INSERT INTO t048_hardening_report VALUES ('L', 'SUPER admin cross-org org SELECT', 'ALLOWED (2)', v_cnt::text, CASE WHEN v_cnt = 2 THEN 'PASS' ELSE 'FAIL' END);

  -- ============================================================
  -- M: Cleanup fixtures
  -- ============================================================
  DELETE FROM public.order_items WHERE order_id = v_order_a;
  DELETE FROM public.orders WHERE id = v_order_a;
  DELETE FROM public.events WHERE id IN (v_event_a, v_event_a_pub, v_event_b);
  DELETE FROM public.venues WHERE id IN (v_venue_a, v_venue_b);
  DELETE FROM public.organization_memberships WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizer_profiles WHERE profile_id IN (v_user_a, v_user_b);
  DELETE FROM public.venue_owner_profiles WHERE profile_id IN (v_user_a, v_user_b);
  DELETE FROM public.super_admin_profiles WHERE profile_id = v_super;
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (v_user_a, v_user_b, v_user_admin, v_user_member, v_customer_a, v_customer_b, v_super);
  DELETE FROM auth.users WHERE id IN (v_user_a, v_user_b, v_user_admin, v_user_member, v_customer_a, v_customer_b, v_super);

  SELECT count(*) INTO v_cnt FROM public.organizations WHERE created_from_profile_id IN (v_user_a, v_user_b);
  INSERT INTO t048_hardening_report VALUES ('M', 'Cleanup no test organizations remain', '0', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM public.organization_memberships om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE o.created_from_profile_id IN (v_user_a, v_user_b);
  INSERT INTO t048_hardening_report VALUES ('M', 'Cleanup no test memberships remain', '0', v_cnt::text, CASE WHEN v_cnt = 0 THEN 'PASS' ELSE 'FAIL' END);

END $$;

SELECT section, test_name, expected, actual, result
FROM t048_hardening_report
ORDER BY section, test_name;
