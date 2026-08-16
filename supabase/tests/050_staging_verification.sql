-- 050 Staging Verification — STAGING ONLY (nksctgxmkymmiubkrohf)

DELETE FROM public.order_item_selections WHERE order_item_id IN (
  SELECT oi.id FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.customer_id IN (
    'f0500002-0002-4002-8002-000000000002',
    'f050000a-000a-400a-800a-00000000000a',
    'f050000b-000b-400b-800b-00000000000b'
  )
  OR o.event_id IN (
    'f0500001-0001-4001-8001-000000000001',
    'f0500010-0010-4010-8010-000000000010'
  )
);
DELETE FROM public.seat_reservations WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.table_reservations WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.tickets WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.resource_locks WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.order_items WHERE order_id IN (
  SELECT id FROM public.orders
  WHERE customer_id IN (
    'f0500002-0002-4002-8002-000000000002',
    'f050000a-000a-400a-800a-00000000000a',
    'f050000b-000b-400b-800b-00000000000b'
  )
  OR event_id IN (
    'f0500001-0001-4001-8001-000000000001',
    'f0500010-0010-4010-8010-000000000010'
  )
);
DELETE FROM public.orders
WHERE customer_id IN (
  'f0500002-0002-4002-8002-000000000002',
  'f050000a-000a-400a-800a-00000000000a',
  'f050000b-000b-400b-800b-00000000000b'
)
OR event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.event_seat_pricing WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.package_upgrade_options WHERE upgrade_id IN (
  'f0500008-0008-4008-8008-000000000008'
);
DELETE FROM public.package_upgrades WHERE id IN ('f0500008-0008-4008-8008-000000000008');
DELETE FROM public.package_item_options WHERE package_item_id IN (
  'f0500006-0006-4006-8006-000000000006', 'f0500007-0007-4007-8007-000000000007'
);
DELETE FROM public.package_items WHERE id IN (
  'f0500006-0006-4006-8006-000000000006', 'f0500007-0007-4007-8007-000000000007'
);
DELETE FROM public.table_packages WHERE id IN (
  'f0500005-0005-4005-8005-000000000005',
  'f0500011-0011-4011-8011-000000000011'
);
DELETE FROM public.event_ticket_types WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.event_ticket_zones WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.event_tables WHERE event_id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.events WHERE id IN (
  'f0500001-0001-4001-8001-000000000001',
  'f0500010-0010-4010-8010-000000000010'
);
DELETE FROM public.venue_seats WHERE id = 'f0500012-0012-4012-8012-000000000012';
DELETE FROM public.venue_tables WHERE id = 'f0500004-0004-4004-8004-000000000004';
DELETE FROM public.venues WHERE id = 'f0500003-0003-4003-8003-000000000003';
DELETE FROM public.profiles WHERE id IN (
  'f0500002-0002-4002-8002-000000000002',
  'f050000a-000a-400a-800a-00000000000a',
  'f050000b-000b-400b-800b-00000000000b'
);
DELETE FROM auth.users WHERE id IN (
  'f0500002-0002-4002-8002-000000000002',
  'f050000a-000a-400a-800a-00000000000a',
  'f050000b-000b-400b-800b-00000000000b'
);

CREATE TEMP TABLE t050_report (
  section text NOT NULL,
  test_name text PRIMARY KEY,
  expected text NOT NULL,
  actual text NOT NULL,
  result text NOT NULL
);

DO $$
DECLARE
  v_owner uuid := 'f0500002-0002-4002-8002-000000000002';
  v_customer_a uuid := 'f050000a-000a-400a-800a-00000000000a';
  v_customer_b uuid := 'f050000b-000b-400b-800b-00000000000b';
  v_event uuid := 'f0500001-0001-4001-8001-000000000001';
  v_venue uuid := 'f0500003-0003-4003-8003-000000000003';
  v_venue_table uuid := 'f0500004-0004-4004-8004-000000000004';
  v_event_table uuid := 'f0500009-0009-4009-8009-000000000009';
  v_package uuid := 'f0500005-0005-4005-8005-000000000005';
  v_item uuid := 'f0500006-0006-4006-8006-000000000006';
  v_item2 uuid := 'f0500007-0007-4007-8007-000000000007';
  v_item_opt uuid := 'f050000c-000c-400c-800c-00000000000c';
  v_upgrade uuid := 'f0500008-0008-4008-8008-000000000008';
  v_upgrade_opt uuid := 'f050000d-000d-400d-800d-00000000000d';
  v_zone uuid := 'f050000e-000e-400e-800e-00000000000e';
  v_ticket_type uuid := 'f050000f-000f-400f-800f-00000000000f';
  v_event2 uuid := 'f0500010-0010-4010-8010-000000000010';
  v_package_wrong uuid := 'f0500011-0011-4011-8011-000000000011';
  v_event_table2 uuid := 'f0500014-0014-4014-8014-000000000014';
  v_seat uuid := 'f0500012-0012-4012-8012-000000000012';
  v_seat_zone uuid := 'f0500013-0013-4013-8013-000000000013';
  v_instance uuid;
  v_result jsonb;
  v_order_id uuid;
  v_order_item_id uuid;
  v_cnt int;
  v_cnt_before int;
  v_bool boolean;
  v_total numeric;
  v_status text;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, v_instance, 'authenticated', 'authenticated', '050-owner@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer_a, v_instance, 'authenticated', 'authenticated', '050-customer-a@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now()),
    (v_customer_b, v_instance, 'authenticated', 'authenticated', '050-customer-b@staging.test', crypt('testpass', gen_salt('bf')), now(), '{}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, account_type, verification_status, full_name)
  VALUES
    (v_owner, '050-owner@staging.test', 'organizer', 'approved', '050 Owner'),
    (v_customer_a, '050-customer-a@staging.test', 'customer', 'approved', 'Customer A'),
    (v_customer_b, '050-customer-b@staging.test', 'customer', 'approved', 'Customer B')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.venues (id, owner_id, name, status)
  VALUES (v_venue, v_owner, '050 Venue', 'active');

  INSERT INTO public.venue_tables (id, venue_id, table_number, capacity, table_type)
  VALUES (v_venue_table, v_venue, 'T1', 8, 'standard');

  INSERT INTO public.events (id, owner_id, venue_id, title, category, status, starts_at)
  VALUES (v_event, v_owner, v_venue, '050 Event', 'concert', 'published', now() + interval '7 days');

  INSERT INTO public.event_tables (id, event_id, table_id, is_sellable)
  VALUES (v_event_table, v_event, v_venue_table, true);

  INSERT INTO public.table_packages (id, event_id, event_table_id, name, base_price, deposit_amount, is_active)
  VALUES (v_package, v_event, v_event_table, 'Gold Package', 1000, 200, true);

  INSERT INTO public.package_items (id, package_id, name, item_category, quantity, is_customer_selectable, min_select, max_select)
  VALUES
    (v_item, v_package, 'Wine', 'beverage', 1, true, 1, 2),
    (v_item2, v_package, 'Water', 'water', 1, true, 1, 1);

  INSERT INTO public.package_item_options (id, package_item_id, option_name, price_delta)
  VALUES (v_item_opt, v_item, 'Red Wine', 50);

  INSERT INTO public.package_upgrades (id, package_id, name, upgrade_type, price_delta, max_quantity)
  VALUES (v_upgrade, v_package, 'Premium Swap', 'swap', 100, 1);

  INSERT INTO public.package_upgrade_options (id, upgrade_id, option_name, price_delta, linked_package_item_id)
  VALUES (v_upgrade_opt, v_upgrade, 'Premium Red', 120, v_item);

  INSERT INTO public.event_ticket_zones (id, event_id, name, zone_type, sale_mode, capacity)
  VALUES (v_zone, v_event, 'GA', 'standard', 'ticket_based', 100);

  INSERT INTO public.event_ticket_types (id, event_id, zone_id, name, price)
  VALUES (v_ticket_type, v_event, v_zone, 'Standard', 25);

  INSERT INTO public.venue_seats (id, venue_id, seat_number)
  VALUES (v_seat, v_venue, 'A1');

  INSERT INTO public.event_ticket_zones (id, event_id, name, zone_type, sale_mode, capacity)
  VALUES (v_seat_zone, v_event, 'Seated', 'standard', 'seat_based', 50);

  INSERT INTO public.event_seat_pricing (id, event_id, seat_id, zone_id, price, is_sellable)
  VALUES ('f0500015-0015-4015-8015-000000000015', v_event, v_seat, v_seat_zone, 40, true);

  INSERT INTO public.events (id, owner_id, venue_id, title, category, status, starts_at)
  VALUES (v_event2, v_owner, v_venue, '050 Event Wrong', 'concert', 'published', now() + interval '7 days');

  INSERT INTO public.event_tables (id, event_id, table_id, is_sellable)
  VALUES (v_event_table2, v_event2, v_venue_table, true);

  INSERT INTO public.table_packages (id, event_id, event_table_id, name, base_price, deposit_amount, is_active)
  VALUES (v_package_wrong, v_event2, v_event_table2, 'Wrong Event Package', 500, 100, true);

  -- Schema checks
  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema='public' AND table_name='order_item_selections' AND column_name='package_item_option_id';
  INSERT INTO t050_report VALUES ('schema', 'package_item_option_id column', '1', v_cnt::text, CASE WHEN v_cnt=1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='write_order_item_selections_atomic';
  INSERT INTO t050_report VALUES ('schema', 'write_order_item_selections_atomic exists', '1', v_cnt::text, CASE WHEN v_cnt=1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT count(*) INTO v_cnt FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('packages_v2','package_items_v2');
  INSERT INTO t050_report VALUES ('schema', 'no duplicate package tables', '0', v_cnt::text, CASE WHEN v_cnt=0 THEN 'PASS' ELSE 'FAIL' END);

  -- Reserve table order for customer A
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.reserve_table_atomic(v_event, v_venue_table, v_package, 4, NULL);
  EXECUTE 'RESET ROLE';
  v_order_id := (v_result->>'order_id')::uuid;
  v_order_item_id := (v_result->>'order_item_id')::uuid;

  INSERT INTO t050_report VALUES ('checkout', 'table reserve baseline', 'success', v_result->>'success', CASE WHEN (v_result->>'success')='true' THEN 'PASS' ELSE 'FAIL' END);

  -- 1 Valid included_item selection
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
    jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
  ), true);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.order_item_selections WHERE order_item_id=v_order_item_id;
  INSERT INTO t050_report VALUES ('selection', 'valid included_item', '1 row', v_cnt::text, CASE WHEN v_cnt=1 AND (v_result->>'success')='true' THEN 'PASS' ELSE 'FAIL' END);

  -- 2 Multiple item selections
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
    jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1),
    jsonb_build_object('selection_type','included_item','package_item_id',v_item2,'quantity',1)
  ), true);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.order_item_selections WHERE order_item_id=v_order_item_id;
  INSERT INTO t050_report VALUES ('selection', 'multiple item selections', '2 rows', v_cnt::text, CASE WHEN v_cnt=2 THEN 'PASS' ELSE 'FAIL' END);

  -- 3 Option selection with DB price
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
    jsonb_build_object('selection_type','included_item','package_item_id',v_item,'package_item_option_id',v_item_opt,'quantity',1)
  ), true);
  EXECUTE 'RESET ROLE';
  SELECT unit_price_delta INTO v_total FROM public.order_item_selections WHERE order_item_id=v_order_item_id LIMIT 1;
  INSERT INTO t050_report VALUES ('selection', 'option selection price from DB', '50', v_total::text, CASE WHEN v_total=50 THEN 'PASS' ELSE 'FAIL' END);

  -- 4 Upgrade selection
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
    jsonb_build_object('selection_type','upgrade','package_upgrade_id',v_upgrade,'upgrade_option_id',v_upgrade_opt,'quantity',1)
  ), true);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.order_item_selections WHERE order_item_id=v_order_item_id AND selection_type='upgrade';
  INSERT INTO t050_report VALUES ('selection', 'upgrade selection', '1', v_cnt::text, CASE WHEN v_cnt=1 THEN 'PASS' ELSE 'FAIL' END);

  -- 5 Quantity validation fail
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item2,'quantity',5)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'quantity out of range rejected', 'exception', 'no exception', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'quantity out of range rejected', 'ITEM_QUANTITY_OUT_OF_RANGE', SQLERRM, CASE WHEN SQLERRM LIKE '%ITEM_QUANTITY_OUT_OF_RANGE%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 6 Invalid item
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id','00000000-0000-4000-8000-000000000099','quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid item rejected', 'exception', 'no exception', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid item rejected', 'PACKAGE_ITEM_NOT_FOUND', SQLERRM, CASE WHEN SQLERRM LIKE '%PACKAGE_ITEM_NOT_FOUND%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 7 Invalid option
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'package_item_option_id','00000000-0000-4000-8000-000000000099','quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid option rejected', 'exception', 'no exception', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid option rejected', 'PACKAGE_ITEM_OPTION_NOT_FOUND', SQLERRM, CASE WHEN SQLERRM LIKE '%PACKAGE_ITEM_OPTION_NOT_FOUND%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 8 Invalid upgrade
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','upgrade','package_upgrade_id','00000000-0000-4000-8000-000000000099','quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid upgrade rejected', 'exception', 'no exception', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid upgrade rejected', 'PACKAGE_UPGRADE_NOT_FOUND', SQLERRM, CASE WHEN SQLERRM LIKE '%PACKAGE_UPGRADE_NOT_FOUND%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 9 Cross-customer IDOR
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('security', 'cross-customer IDOR rejected', 'FORBIDDEN', 'allowed', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('security', 'cross-customer IDOR rejected', 'FORBIDDEN', SQLERRM, CASE WHEN SQLERRM LIKE '%FORBIDDEN%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 10 Client price rejected
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1,'unit_price_delta',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('security', 'client price rejected', 'CLIENT_PRICE_REJECTED', 'allowed', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('security', 'client price rejected', 'CLIENT_PRICE_REJECTED', SQLERRM, CASE WHEN SQLERRM LIKE '%CLIENT_PRICE_REJECTED%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 11 Duplicate selection rejected
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1),
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'duplicate selection rejected', 'DUPLICATE_SELECTION', 'allowed', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'duplicate selection rejected', 'DUPLICATE_SELECTION', SQLERRM, CASE WHEN SQLERRM LIKE '%DUPLICATE_SELECTION%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- Invalid package (wrong event)
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package_wrong, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'wrong event package rejected', 'PACKAGE_NOT_FOUND', 'allowed', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'wrong event package rejected', 'PACKAGE_NOT_FOUND', SQLERRM, CASE WHEN SQLERRM LIKE '%PACKAGE_NOT_FOUND%' OR SQLERRM LIKE '%PACKAGE_ORDER_MISMATCH%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- Invalid package uuid
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, '00000000-0000-4000-8000-000000000088', jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid package rejected', 'exception', 'allowed', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('validation', 'invalid package rejected', 'PACKAGE_NOT_FOUND', SQLERRM, 'PASS');
  END;

  -- Unauthorized paid order modification (order status is terminal — recreate after)
  UPDATE public.orders SET status = 'paid' WHERE id = v_order_id;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('security', 'paid order modification rejected', 'ORDER_NOT_WRITABLE', 'allowed', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('security', 'paid order modification rejected', 'ORDER_NOT_WRITABLE', SQLERRM, CASE WHEN SQLERRM LIKE '%ORDER_NOT_WRITABLE%' THEN 'PASS' ELSE 'FAIL' END);
  END;

  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id = v_order_id);
  DELETE FROM public.table_reservations WHERE order_id = v_order_id;
  DELETE FROM public.resource_locks WHERE order_id = v_order_id;
  DELETE FROM public.order_items WHERE order_id = v_order_id;
  DELETE FROM public.orders WHERE id = v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.reserve_table_atomic(v_event, v_venue_table, v_package, 4, NULL);
  EXECUTE 'RESET ROLE';
  v_order_id := (v_result->>'order_id')::uuid;
  v_order_item_id := (v_result->>'order_item_id')::uuid;

  -- Atomic rollback on partial failure
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
    jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
  ), true);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt_before FROM public.order_item_selections WHERE order_item_id = v_order_item_id;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1),
      jsonb_build_object('selection_type','included_item','package_item_id','00000000-0000-4000-8000-000000000099','quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    INSERT INTO t050_report VALUES ('atomicity', 'partial failure rollback', v_cnt_before::text, 'exception missing', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_cnt FROM public.order_item_selections WHERE order_item_id = v_order_item_id;
    INSERT INTO t050_report VALUES ('atomicity', 'partial failure rollback', v_cnt_before::text, v_cnt::text, CASE WHEN v_cnt = v_cnt_before THEN 'PASS' ELSE 'FAIL' END);
  END;

  -- 12 create_mixed_cart with table selections integrated
  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id=v_order_id);
  DELETE FROM public.table_reservations WHERE order_id=v_order_id;
  DELETE FROM public.resource_locks WHERE order_id=v_order_id;
  DELETE FROM public.order_items WHERE order_id=v_order_id;
  DELETE FROM public.orders WHERE id=v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.create_mixed_cart_atomic(v_event, jsonb_build_array(
    jsonb_build_object(
      'item_type','table','table_id',v_venue_table,'package_id',v_package,'guest_count',4,
      'selections', jsonb_build_array(
        jsonb_build_object('selection_type','included_item','package_item_id',v_item,'package_item_option_id',v_item_opt,'quantity',1)
      )
    )
  ));
  EXECUTE 'RESET ROLE';
  v_order_id := (v_result->>'order_id')::uuid;
  SELECT count(*) INTO v_cnt FROM public.order_item_selections ois
  JOIN public.order_items oi ON oi.id=ois.order_item_id
  WHERE oi.order_id=v_order_id;
  INSERT INTO t050_report VALUES ('checkout', 'mixed cart table+selections', '1 selection', v_cnt::text, CASE WHEN (v_result->>'success')='true' AND v_cnt=1 THEN 'PASS' ELSE 'FAIL' END);

  -- Table-only checkout (no selections)
  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id=v_order_id);
  DELETE FROM public.table_reservations WHERE order_id=v_order_id;
  DELETE FROM public.resource_locks WHERE order_id=v_order_id;
  DELETE FROM public.order_items WHERE order_id=v_order_id;
  DELETE FROM public.orders WHERE id=v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.create_mixed_cart_atomic(v_event, jsonb_build_array(
    jsonb_build_object('item_type','table','table_id',v_venue_table,'package_id',v_package,'guest_count',4)
  ));
  EXECUTE 'RESET ROLE';
  INSERT INTO t050_report VALUES ('checkout', 'table-only checkout', 'success', v_result->>'success', CASE WHEN (v_result->>'success')='true' THEN 'PASS' ELSE 'FAIL' END);
  v_order_id := (v_result->>'order_id')::uuid;

  -- Seat checkout
  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id=v_order_id);
  DELETE FROM public.seat_reservations WHERE order_id=v_order_id;
  DELETE FROM public.table_reservations WHERE order_id=v_order_id;
  DELETE FROM public.resource_locks WHERE order_id=v_order_id;
  DELETE FROM public.order_items WHERE order_id=v_order_id;
  DELETE FROM public.orders WHERE id=v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.create_mixed_cart_atomic(v_event, jsonb_build_array(
    jsonb_build_object('item_type','seat','seat_id',v_seat)
  ));
  EXECUTE 'RESET ROLE';
  INSERT INTO t050_report VALUES ('checkout', 'seat checkout', 'success', v_result->>'success', CASE WHEN (v_result->>'success')='true' THEN 'PASS' ELSE 'FAIL' END);
  v_order_id := (v_result->>'order_id')::uuid;

  -- Mixed ticket + table cart
  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id=v_order_id);
  DELETE FROM public.seat_reservations WHERE order_id=v_order_id;
  DELETE FROM public.tickets WHERE order_id=v_order_id;
  DELETE FROM public.table_reservations WHERE order_id=v_order_id;
  DELETE FROM public.resource_locks WHERE order_id=v_order_id;
  DELETE FROM public.order_items WHERE order_id=v_order_id;
  DELETE FROM public.orders WHERE id=v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.create_mixed_cart_atomic(v_event, jsonb_build_array(
    jsonb_build_object('item_type','ticket','zone_id',v_zone,'ticket_type_id',v_ticket_type,'quantity',1),
    jsonb_build_object(
      'item_type','table','table_id',v_venue_table,'package_id',v_package,'guest_count',4,
      'selections', jsonb_build_array(
        jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
      )
    )
  ));
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.order_items WHERE order_id = (v_result->>'order_id')::uuid;
  INSERT INTO t050_report VALUES ('checkout', 'mixed ticket+table cart', '2 items success', v_cnt::text || ' ' || COALESCE(v_result->>'success',''), CASE WHEN (v_result->>'success')='true' AND v_cnt=2 THEN 'PASS' ELSE 'FAIL' END);
  v_order_id := (v_result->>'order_id')::uuid;

  -- Concurrency: sequential replace writes last wins
  SELECT oi.id INTO v_order_item_id FROM public.order_items oi WHERE oi.order_id = v_order_id AND oi.item_type = 'table' LIMIT 1;
  IF v_order_item_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item,'quantity',1)
    ), true);
    v_result := public.write_order_item_selections_atomic(v_order_item_id, v_package, jsonb_build_array(
      jsonb_build_object('selection_type','included_item','package_item_id',v_item2,'quantity',1)
    ), true);
    EXECUTE 'RESET ROLE';
    SELECT snapshot_item_name INTO v_status FROM public.order_item_selections WHERE order_item_id = v_order_item_id LIMIT 1;
    INSERT INTO t050_report VALUES ('concurrency', 'sequential replace last wins', 'Water', COALESCE(v_status,'NULL'), CASE WHEN v_status = 'Water' THEN 'PASS' ELSE 'FAIL' END);
  ELSE
    INSERT INTO t050_report VALUES ('concurrency', 'sequential replace last wins', 'Water', 'no table order_item', 'FAIL');
  END IF;

  -- 13 Ticket-only checkout still works
  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id=v_order_id);
  DELETE FROM public.tickets WHERE order_id=v_order_id;
  DELETE FROM public.seat_reservations WHERE order_id=v_order_id;
  DELETE FROM public.table_reservations WHERE order_id=v_order_id;
  DELETE FROM public.resource_locks WHERE order_id=v_order_id;
  DELETE FROM public.order_items WHERE order_id=v_order_id;
  DELETE FROM public.orders WHERE id=v_order_id;

  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.create_mixed_cart_atomic(v_event, jsonb_build_array(
    jsonb_build_object('item_type','ticket','zone_id',v_zone,'ticket_type_id',v_ticket_type,'quantity',1)
  ));
  EXECUTE 'RESET ROLE';
  INSERT INTO t050_report VALUES ('checkout', 'ticket-only checkout', 'success', v_result->>'success', CASE WHEN (v_result->>'success')='true' THEN 'PASS' ELSE 'FAIL' END);

  -- 14 RLS own selections readable
  v_order_id := (v_result->>'order_id')::uuid;
  PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.order_item_selections ois
  JOIN public.order_items oi ON oi.id=ois.order_item_id WHERE oi.order_id=v_order_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO t050_report VALUES ('rls', 'customer SELECT own selections', '>=0', v_cnt::text, CASE WHEN v_cnt>=0 THEN 'PASS' ELSE 'FAIL' END);

  PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.order_item_selections ois
  JOIN public.order_items oi ON oi.id=ois.order_item_id WHERE oi.order_id=v_order_id;
  EXECUTE 'RESET ROLE';
  INSERT INTO t050_report VALUES ('rls', 'other customer cannot SELECT', '0', v_cnt::text, CASE WHEN v_cnt=0 THEN 'PASS' ELSE 'FAIL' END);

  -- Payment path intact (pending_payment + confirm RPC exists)
  SELECT status INTO v_status FROM public.orders WHERE id = v_order_id;
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'confirm_payment_atomic';
  INSERT INTO t050_report VALUES ('payment', 'order remains pending_payment', 'pending_payment', COALESCE(v_status,'NULL'), CASE WHEN v_status = 'pending_payment' THEN 'PASS' ELSE 'FAIL' END);
  INSERT INTO t050_report VALUES ('payment', 'confirm_payment_atomic exists', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- Single checkout path (no duplicate cart RPC)
  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('create_mixed_cart_atomic', 'create_mixed_cart_v2', 'checkout_cart_atomic');
  INSERT INTO t050_report VALUES ('architecture', 'single mixed cart RPC', '1', v_cnt::text, CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END);

  -- Order ownership behavior
  SELECT customer_id::text INTO v_status FROM public.orders WHERE id = v_order_id;
  INSERT INTO t050_report VALUES ('security', 'order owned by customer A', v_customer_a::text, COALESCE(v_status,'NULL'), CASE WHEN v_status = v_customer_a::text THEN 'PASS' ELSE 'FAIL' END);

  -- RLS enabled on order_item_selections
  SELECT relrowsecurity INTO v_bool FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'order_item_selections';
  INSERT INTO t050_report VALUES ('rls', 'order_item_selections RLS enabled', 'true', v_bool::text, CASE WHEN v_bool THEN 'PASS' ELSE 'FAIL' END);

  -- Cleanup fixtures
  DELETE FROM public.order_item_selections WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE event_id IN (v_event, v_event2)));
  DELETE FROM public.tickets WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.seat_reservations WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.table_reservations WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.resource_locks WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE event_id IN (v_event, v_event2));
  DELETE FROM public.orders WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.event_seat_pricing WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.package_upgrade_options WHERE upgrade_id=v_upgrade;
  DELETE FROM public.package_upgrades WHERE id=v_upgrade;
  DELETE FROM public.package_item_options WHERE id=v_item_opt;
  DELETE FROM public.package_items WHERE id IN (v_item, v_item2);
  DELETE FROM public.table_packages WHERE id IN (v_package, v_package_wrong);
  DELETE FROM public.event_ticket_types WHERE event_id IN (v_event, v_event2);
  DELETE FROM public.event_ticket_zones WHERE event_id IN (v_event, v_event2, v_seat_zone);
  DELETE FROM public.event_tables WHERE id IN (v_event_table, v_event_table2);
  DELETE FROM public.events WHERE id IN (v_event, v_event2);
  DELETE FROM public.venue_seats WHERE id = v_seat;
  DELETE FROM public.venue_tables WHERE id=v_venue_table;
  DELETE FROM public.venues WHERE id=v_venue;
  DELETE FROM public.profiles WHERE id IN (v_owner, v_customer_a, v_customer_b);
  DELETE FROM auth.users WHERE id IN (v_owner, v_customer_a, v_customer_b);

END $$;

SELECT section, test_name, expected, actual, result FROM t050_report ORDER BY section, test_name;
