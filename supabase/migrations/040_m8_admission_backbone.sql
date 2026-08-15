-- Migration 040 — M8 admission backbone (decisions 040-K1…K9)
-- Scope: entry_pass online/field flows, capacity helpers, confirm/use_qr updates,
--         field door table + ticket RPCs.
-- Migrations 035 / 036 / 037 / 038 / 039 are not modified.
-- NOT APPLIED — draft for review.

-- ---------------------------------------------------------------------------
-- 1. DDL — entry_pass provenance (K8, K9) + multi-reservation capacity (K1)
-- ---------------------------------------------------------------------------

ALTER TABLE public.entry_passes
  ADD COLUMN issue_channel text NOT NULL DEFAULT 'online',
  ADD COLUMN issued_by uuid NULL REFERENCES public.profiles (id);

ALTER TABLE public.entry_passes
  ADD CONSTRAINT entry_passes_issue_channel_check CHECK (
    issue_channel IN ('online', 'field')
  );

CREATE INDEX entry_passes_event_issue_channel_idx
  ON public.entry_passes (event_id, issue_channel)
  WHERE status IN ('active', 'used');

DROP INDEX IF EXISTS public.table_reservations_event_table_sold_unique;

CREATE INDEX table_reservations_event_table_active_idx
  ON public.table_reservations (event_id, table_id)
  WHERE status IN ('confirmed', 'used');

-- ---------------------------------------------------------------------------
-- 2. Capacity helpers (K4 — effective capacity)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_effective_table_capacity(p_event_table_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(et.max_guests, vt.capacity)::integer
  FROM public.event_tables AS et
  JOIN public.venue_tables AS vt ON vt.id = et.table_id
  WHERE et.id = p_event_table_id;
$$;

CREATE OR REPLACE FUNCTION public.count_table_admission_passes(p_event_table_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.entry_passes AS ep
  JOIN public.table_reservations AS tr ON tr.id = ep.parent_id
  WHERE ep.parent_type = 'table_reservation'
    AND tr.event_table_id = p_event_table_id
    AND tr.status IN ('confirmed', 'used')
    AND ep.status IN ('active', 'used');
$$;

-- Locks event_tables row (FOR UPDATE) and returns NULL when capacity is available,
-- or an error_code text when not.
CREATE OR REPLACE FUNCTION public.check_table_capacity_available(
  p_event_table_id uuid,
  p_additional_passes integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective integer;
  v_current integer;
BEGIN
  IF p_additional_passes IS NULL OR p_additional_passes <= 0 THEN
    RETURN 'INVALID_PASS_COUNT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.event_tables AS et
    WHERE et.id = p_event_table_id
    FOR UPDATE
  ) THEN
    RETURN 'EVENT_TABLE_NOT_FOUND';
  END IF;

  v_effective := public.get_effective_table_capacity(p_event_table_id);
  IF v_effective IS NULL THEN
    RETURN 'EVENT_TABLE_NOT_FOUND';
  END IF;

  v_current := public.count_table_admission_passes(p_event_table_id);

  IF v_current + p_additional_passes > v_effective THEN
    RETURN 'CAPACITY_EXCEEDED';
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Entry pass + QR helper (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_entry_pass_with_qr(
  p_parent_type text,
  p_parent_id uuid,
  p_event_id uuid,
  p_holder_id uuid,
  p_issue_channel text,
  p_issued_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass_id uuid := gen_random_uuid();
  v_qr_id uuid;
BEGIN
  INSERT INTO public.qr_codes (
    token, entity_type, entity_id, event_id, holder_id, status, issued_at
  )
  VALUES (
    encode(extensions.gen_random_bytes(32), 'hex'),
    'entry_pass', v_pass_id, p_event_id, p_holder_id, 'active', now()
  )
  RETURNING id INTO v_qr_id;

  INSERT INTO public.entry_passes (
    id, parent_type, parent_id, event_id, holder_id, status, qr_code_id,
    issue_channel, issued_by
  )
  VALUES (
    v_pass_id, p_parent_type, p_parent_id, p_event_id, p_holder_id, 'active', v_qr_id,
    p_issue_channel, p_issued_by
  );

  RETURN v_pass_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Partial admission sync (D6/D7)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_table_reservation_admission_status(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchased integer;
  v_admitted integer;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE ep.status = 'used')::integer
  INTO v_purchased, v_admitted
  FROM public.entry_passes AS ep
  WHERE ep.parent_type = 'table_reservation'
    AND ep.parent_id = p_reservation_id;

  IF v_purchased = 0 THEN
    RETURN;
  END IF;

  IF v_admitted >= v_purchased THEN
    UPDATE public.table_reservations
    SET status = 'used'
    WHERE id = p_reservation_id
      AND status = 'confirmed';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. confirm_payment_atomic — online table passes at confirm (E3, K3, K5)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount numeric,
  p_currency text,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_payment_id uuid;
  v_row RECORD;
  v_qr_id uuid;
  v_line_item_id uuid;
  v_capacity_error text;
  v_i integer;
BEGIN
  IF NOT (public.is_service_context() OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_FOUND');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_order.event_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'noop', true);
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_PAYABLE');
  END IF;

  INSERT INTO public.payments (
    order_id, provider, provider_payment_id, amount, currency, status, payment_method, paid_at, created_at
  )
  VALUES (
    p_order_id, p_provider, p_provider_payment_id, p_amount, p_currency,
    'succeeded', p_payment_method, now(), now()
  )
  RETURNING id INTO v_payment_id;

  -- Tickets: pending_payment → active, zone counters reserved → sold, QR issued
  FOR v_row IN
    SELECT * FROM public.tickets WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
    VALUES (
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ticket', v_row.id, v_row.event_id, v_row.holder_id, 'active', now()
    )
    RETURNING id INTO v_qr_id;

    UPDATE public.tickets
    SET status = 'active', qr_code_id = v_qr_id, confirmed_at = now()
    WHERE id = v_row.id;

    UPDATE public.event_ticket_zones
    SET reserved_count = GREATEST(reserved_count - 1, 0),
        sold_count = sold_count + 1
    WHERE id = v_row.zone_id;
  END LOOP;

  -- Seat reservations: pending_payment → confirmed
  FOR v_row IN
    SELECT * FROM public.seat_reservations WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
    VALUES (
      encode(extensions.gen_random_bytes(32), 'hex'),
      'seat_reservation', v_row.id, v_row.event_id, v_row.customer_id, 'active', now()
    )
    RETURNING id INTO v_qr_id;

    UPDATE public.seat_reservations
    SET status = 'confirmed', qr_code_id = v_qr_id, confirmed_at = now()
    WHERE id = v_row.id;
  END LOOP;

  -- Table reservations: pending_payment → confirmed + N entry_passes (K5: no legacy table QR)
  FOR v_row IN
    SELECT * FROM public.table_reservations WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.entry_passes AS ep
      WHERE ep.parent_type = 'table_reservation'
        AND ep.parent_id = v_row.id
    ) THEN
      UPDATE public.table_reservations
      SET status = 'confirmed',
          confirmed_at = COALESCE(confirmed_at, now()),
          collection_type = 'online'
      WHERE id = v_row.id;

      UPDATE public.table_reservations
      SET financial_status = 'online_paid'
      WHERE id = v_row.id AND financial_status = 'pending_payment';

      CONTINUE;
    END IF;

    IF v_row.guest_count IS NULL OR v_row.guest_count <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'GUEST_COUNT_REQUIRED');
    END IF;

    v_capacity_error := public.check_table_capacity_available(v_row.event_table_id, v_row.guest_count);
    IF v_capacity_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_capacity_error);
    END IF;

    UPDATE public.table_reservations
    SET status = 'confirmed',
        qr_code_id = NULL,
        confirmed_at = now(),
        collection_type = 'online'
    WHERE id = v_row.id;

    UPDATE public.table_reservations
    SET financial_status = 'online_paid'
    WHERE id = v_row.id AND financial_status = 'pending_payment';

    FOR v_i IN 1..v_row.guest_count LOOP
      PERFORM public.create_entry_pass_with_qr(
        'table_reservation',
        v_row.id,
        v_row.event_id,
        NULL,
        'online',
        NULL
      );
    END LOOP;

    IF COALESCE(v_row.snapshot_deposit_amount, 0) > 0 THEN
      INSERT INTO public.payment_line_items (
        payment_id, line_type, line_role, amount, description, reference_type, reference_id, created_at
      )
      VALUES (
        v_payment_id, 'deposit', 'allocation_online', v_row.snapshot_deposit_amount,
        v_row.snapshot_package_name, 'table_reservation', v_row.id::text, now()
      )
      RETURNING id INTO v_line_item_id;

      INSERT INTO public.deposits (
        order_id, payment_id, payment_line_item_id, reservation_type, reservation_id, amount, status
      )
      VALUES (
        p_order_id, v_payment_id, v_line_item_id, 'table_reservation', v_row.id,
        v_row.snapshot_deposit_amount, 'collected'
      );

      IF COALESCE(v_row.snapshot_remaining_amount, 0) > 0 THEN
        INSERT INTO public.payment_line_items (
          payment_id, line_type, line_role, amount, description, reference_type, reference_id, created_at
        )
        VALUES (
          v_payment_id, 'venue_balance', 'allocation_venue', v_row.snapshot_remaining_amount,
          v_row.snapshot_package_name, 'table_reservation', v_row.id::text, now()
        );
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.payment_line_items (
    payment_id, line_type, line_role, amount, description, reference_type, reference_id, created_at
  )
  VALUES (
    v_payment_id, 'gross', 'obligation', v_order.total_amount,
    'order gross', 'order', p_order_id::text, now()
  );

  UPDATE public.resource_locks
  SET status = 'converted'
  WHERE order_id = p_order_id AND status = 'active';

  UPDATE public.orders
  SET status = 'paid',
      paid_at = now(),
      amount_paid_online = p_amount,
      amount_remaining = v_order.total_amount - p_amount,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_id', v_payment_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. use_qr_atomic — entry_pass scan + legacy table_reservation compat (K5)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.use_qr_atomic(
  p_token text,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr public.qr_codes%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_scan_result text;
  v_parent_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_qr FROM public.qr_codes WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID');
  END IF;

  IF NOT public.can_scan_event(v_qr.event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_qr.event_id;
  IF v_event.status = 'postponed' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_POSTPONED');
  END IF;

  IF v_qr.status = 'used' THEN
    v_scan_result := 'already_used';
  ELSIF v_qr.status = 'revoked' THEN
    v_scan_result := 'revoked';
  ELSE
    v_scan_result := 'valid';
  END IF;

  INSERT INTO public.qr_scan_logs (
    qr_code_id, event_id, scanned_by, device_id, scan_result, scanned_at, is_offline
  )
  VALUES (v_qr.id, v_qr.event_id, auth.uid(), p_device_id, v_scan_result, now(), false);

  IF v_scan_result <> 'valid' THEN
    RETURN jsonb_build_object('success', false, 'error_code', upper(v_scan_result));
  END IF;

  UPDATE public.qr_codes
  SET status = 'used', used_at = now()
  WHERE id = v_qr.id;

  CASE v_qr.entity_type
    WHEN 'ticket' THEN
      UPDATE public.tickets SET status = 'used' WHERE id = v_qr.entity_id AND status = 'active';
    WHEN 'table_reservation' THEN
      UPDATE public.table_reservations
      SET status = 'used'
      WHERE id = v_qr.entity_id AND status = 'confirmed';
    WHEN 'seat_reservation' THEN
      UPDATE public.seat_reservations SET status = 'used' WHERE id = v_qr.entity_id AND status = 'confirmed';
    WHEN 'entry_pass' THEN
      UPDATE public.entry_passes
      SET status = 'used'
      WHERE id = v_qr.entity_id AND status = 'active';

      SELECT ep.parent_id
      INTO v_parent_id
      FROM public.entry_passes AS ep
      WHERE ep.id = v_qr.entity_id;

      IF v_parent_id IS NOT NULL THEN
        PERFORM public.sync_table_reservation_admission_status(v_parent_id);
      END IF;
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_QR_ENTITY_TYPE: %', v_qr.entity_type;
  END CASE;

  RETURN jsonb_build_object('success', true, 'qr_code_id', v_qr.id, 'scan_result', v_scan_result);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Field door table reservation + passes (K2, K6)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_field_table_reservation_atomic(
  p_event_id uuid,
  p_table_id uuid,
  p_package_id uuid,
  p_guest_count int,
  p_customer_id uuid,
  p_collection_type text DEFAULT 'venue_collected',
  p_holder_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_event_table public.event_tables%ROWTYPE;
  v_package public.table_packages%ROWTYPE;
  v_order_id uuid;
  v_order_item_id uuid;
  v_reservation_id uuid;
  v_capacity_error text;
  v_deposit numeric(12, 2);
  v_remaining numeric(12, 2);
  v_total numeric(12, 2);
  v_paid_online numeric(12, 2);
  v_financial_status text;
  v_i integer;
  v_pass_ids uuid[] := ARRAY[]::uuid[];
  v_pass_id uuid;
BEGIN
  IF v_operator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CUSTOMER_REQUIRED');
  END IF;

  IF p_guest_count IS NULL OR p_guest_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PASS_COUNT');
  END IF;

  IF p_collection_type NOT IN ('venue_collected', 'complimentary') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COLLECTION_TYPE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CUSTOMER_NOT_FOUND');
  END IF;

  IF NOT public.can_operate_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_event_table
  FROM public.event_tables
  WHERE event_id = p_event_id AND table_id = p_table_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_event_table.is_sellable THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_package
  FROM public.table_packages
  WHERE id = p_package_id
    AND event_id = p_event_id
    AND event_table_id = v_event_table.id
    AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_resource_blocks
    WHERE event_id = p_event_id
      AND resource_type = 'table'
      AND resource_id = p_table_id
      AND is_active
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_BLOCKED');
  END IF;

  v_capacity_error := public.check_table_capacity_available(v_event_table.id, p_guest_count);
  IF v_capacity_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_capacity_error);
  END IF;

  IF p_collection_type = 'complimentary' THEN
    v_total := 0;
    v_deposit := 0;
    v_remaining := 0;
    v_paid_online := 0;
    v_financial_status := 'venue_balance_settled';
  ELSE
    v_deposit := COALESCE(v_package.deposit_amount, 0);
    v_total := v_package.base_price;
    v_remaining := v_total - v_deposit;
    v_paid_online := 0;
    v_financial_status := 'pending_payment';
  END IF;

  INSERT INTO public.orders (
    customer_id, event_id, status, expires_at,
    subtotal_amount, total_amount, currency,
    paid_at, amount_paid_online, amount_remaining, amount_due_now
  )
  VALUES (
    p_customer_id, p_event_id, 'paid', now() + interval '1 year',
    v_total, v_total, NULL,
    CASE WHEN p_collection_type = 'complimentary' THEN now() ELSE NULL END,
    v_paid_online, v_total - v_paid_online, 0
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'table', p_table_id, 1,
    v_total, v_total, v_package.name, 0
  )
  RETURNING id INTO v_order_item_id;

  INSERT INTO public.table_reservations (
    event_id, table_id, event_table_id, package_id, order_id, order_item_id,
    customer_id, status, guest_count,
    snapshot_base_price, snapshot_package_name,
    snapshot_total_amount, snapshot_deposit_amount, snapshot_remaining_amount,
    financial_status, collection_type, confirmed_at
  )
  VALUES (
    p_event_id, p_table_id, v_event_table.id, p_package_id, v_order_id, v_order_item_id,
    p_customer_id, 'confirmed', p_guest_count,
    v_total, v_package.name,
    v_total, v_deposit, v_remaining,
    v_financial_status, p_collection_type, now()
  )
  RETURNING id INTO v_reservation_id;

  FOR v_i IN 1..p_guest_count LOOP
    v_pass_id := public.create_entry_pass_with_qr(
      'table_reservation',
      v_reservation_id,
      p_event_id,
      p_holder_id,
      'field',
      v_operator_id
    );
    v_pass_ids := array_append(v_pass_ids, v_pass_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'reservation_id', v_reservation_id,
    'pass_ids', to_jsonb(v_pass_ids),
    'pass_count', p_guest_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Field additional passes on existing reservation (K4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_field_table_passes_atomic(
  p_reservation_id uuid,
  p_additional_pass_count int,
  p_holder_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid := auth.uid();
  v_res public.table_reservations%ROWTYPE;
  v_capacity_error text;
  v_i integer;
  v_pass_ids uuid[] := ARRAY[]::uuid[];
  v_pass_id uuid;
BEGIN
  IF v_operator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_additional_pass_count IS NULL OR p_additional_pass_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PASS_COUNT');
  END IF;

  SELECT * INTO v_res
  FROM public.table_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND');
  END IF;

  IF NOT public.can_operate_event(v_res.event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_res.status <> 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_ADD_PASS_ELIGIBLE');
  END IF;

  v_capacity_error := public.check_table_capacity_available(v_res.event_table_id, p_additional_pass_count);
  IF v_capacity_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_capacity_error);
  END IF;

  FOR v_i IN 1..p_additional_pass_count LOOP
    v_pass_id := public.create_entry_pass_with_qr(
      'table_reservation',
      v_res.id,
      v_res.event_id,
      p_holder_id,
      'field',
      v_operator_id
    );
    v_pass_ids := array_append(v_pass_ids, v_pass_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'pass_ids', to_jsonb(v_pass_ids),
    'pass_count', p_additional_pass_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Field door tickets — ticket + QR, no entry_passes (K7)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_field_tickets_atomic(
  p_event_id uuid,
  p_zone_id uuid,
  p_ticket_type_id uuid,
  p_quantity int,
  p_customer_id uuid,
  p_collection_type text DEFAULT 'venue_collected'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_zone public.event_ticket_zones%ROWTYPE;
  v_type public.event_ticket_types%ROWTYPE;
  v_order_id uuid;
  v_order_item_id uuid;
  v_total numeric(12, 2);
  v_paid_online numeric(12, 2);
  v_updated int;
  v_qr_id uuid;
  v_ticket_ids uuid[] := ARRAY[]::uuid[];
  v_ticket_id uuid;
  v_ticket RECORD;
BEGIN
  IF v_operator_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CUSTOMER_REQUIRED');
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
  END IF;

  IF p_collection_type NOT IN ('venue_collected', 'complimentary') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COLLECTION_TYPE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CUSTOMER_NOT_FOUND');
  END IF;

  IF NOT public.can_operate_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = p_zone_id FOR UPDATE;
  IF NOT FOUND OR v_zone.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
  END IF;

  IF v_zone.sale_mode <> 'ticket_based' OR NOT v_zone.is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_SALE_MODE');
  END IF;

  SELECT * INTO v_type
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id AND zone_id = p_zone_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
  END IF;

  IF v_type.max_per_order IS NOT NULL AND p_quantity > v_type.max_per_order THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'MAX_PER_ORDER_EXCEEDED');
  END IF;

  UPDATE public.event_ticket_zones
  SET sold_count = sold_count + p_quantity
  WHERE id = p_zone_id
    AND sold_count + p_quantity <= capacity;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CAPACITY_EXCEEDED');
  END IF;

  IF p_collection_type = 'complimentary' THEN
    v_total := 0;
    v_paid_online := 0;
  ELSE
    v_total := v_type.price * p_quantity;
    v_paid_online := 0;
  END IF;

  INSERT INTO public.orders (
    customer_id, event_id, status, expires_at,
    subtotal_amount, total_amount, currency,
    paid_at, amount_paid_online, amount_remaining, amount_due_now
  )
  VALUES (
    p_customer_id, p_event_id, 'paid', now() + interval '1 year',
    v_total, v_total, NULL,
    CASE WHEN p_collection_type = 'complimentary' THEN now() ELSE NULL END,
    v_paid_online, v_total - v_paid_online, 0
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, zone_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'ticket', p_ticket_type_id, p_zone_id, p_quantity,
    CASE WHEN p_collection_type = 'complimentary' THEN 0 ELSE v_type.price END,
    v_total,
    v_type.name,
    0
  )
  RETURNING id INTO v_order_item_id;

  INSERT INTO public.tickets (
    event_id, ticket_type_id, zone_id, order_id, order_item_id, holder_id, status, confirmed_at
  )
  SELECT
    p_event_id, p_ticket_type_id, p_zone_id, v_order_id, v_order_item_id, p_customer_id, 'active', now()
  FROM generate_series(1, p_quantity);

  FOR v_ticket IN
    SELECT t.id
    FROM public.tickets AS t
    WHERE t.order_id = v_order_id
      AND t.status = 'active'
      AND t.qr_code_id IS NULL
  LOOP
    INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
    VALUES (
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ticket', v_ticket.id, p_event_id, p_customer_id, 'active', now()
    )
    RETURNING id INTO v_qr_id;

    UPDATE public.tickets
    SET qr_code_id = v_qr_id
    WHERE id = v_ticket.id;

    v_ticket_ids := array_append(v_ticket_ids, v_ticket.id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'ticket_ids', to_jsonb(v_ticket_ids),
    'quantity', p_quantity,
    'collection_type', p_collection_type
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. reserve_table_atomic — M8 capacity at reserve (B1)
-- Replace TABLE_ALREADY_SOLD with effective-capacity pass counting.
-- All other reserve behavior unchanged from migration 034.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_table_atomic(
  p_event_id uuid,
  p_table_id uuid,
  p_package_id uuid,
  p_guest_count int DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_event_table public.event_tables%ROWTYPE;
  v_package public.table_packages%ROWTYPE;
  v_order_id uuid := p_order_id;
  v_order_item_id uuid;
  v_lock_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_deposit numeric(12, 2);
  v_remaining numeric(12, 2);
  v_capacity_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_event_table
  FROM public.event_tables
  WHERE event_id = p_event_id AND table_id = p_table_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_event_table.is_sellable THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_package
  FROM public.table_packages
  WHERE id = p_package_id
    AND event_id = p_event_id
    AND event_table_id = v_event_table.id
    AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_resource_blocks
    WHERE event_id = p_event_id
      AND resource_type = 'table'
      AND resource_id = p_table_id
      AND is_active
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_BLOCKED');
  END IF;

  IF p_guest_count IS NULL OR p_guest_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'GUEST_COUNT_REQUIRED');
  END IF;

  v_capacity_error := public.check_table_capacity_available(v_event_table.id, p_guest_count);
  IF v_capacity_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_capacity_error);
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.orders (customer_id, event_id, status, expires_at)
    VALUES (v_user_id, p_event_id, 'pending_payment', v_expires_at)
    RETURNING id INTO v_order_id;
  ELSE
    PERFORM 1
    FROM public.orders
    WHERE id = v_order_id
      AND customer_id = v_user_id
      AND event_id = p_event_id
      AND status = 'pending_payment'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_USABLE');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.resource_locks (
      event_id, resource_type, resource_id, locked_by_user_id, order_id, expires_at, status
    )
    VALUES (p_event_id, 'table', p_table_id, v_user_id, v_order_id, v_expires_at, 'active')
    RETURNING id INTO v_lock_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_LOCKED');
  END;

  v_deposit := COALESCE(v_package.deposit_amount, 0);
  v_remaining := v_package.base_price - v_deposit;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'table', p_table_id, 1,
    v_package.base_price, v_package.base_price, v_package.name,
    CASE WHEN v_deposit > 0 THEN v_deposit ELSE v_package.base_price END
  )
  RETURNING id INTO v_order_item_id;

  INSERT INTO public.table_reservations (
    event_id, table_id, event_table_id, package_id, order_id, order_item_id,
    customer_id, status, guest_count,
    snapshot_base_price, snapshot_package_name,
    snapshot_total_amount, snapshot_deposit_amount, snapshot_remaining_amount,
    financial_status
  )
  VALUES (
    p_event_id, p_table_id, v_event_table.id, p_package_id, v_order_id, v_order_item_id,
    v_user_id, 'pending_payment', p_guest_count,
    v_package.base_price, v_package.name,
    v_package.base_price, v_deposit, v_remaining,
    'pending_payment'
  );

  UPDATE public.orders
  SET subtotal_amount = subtotal_amount + v_package.base_price,
      total_amount = total_amount + v_package.base_price,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_id', v_order_item_id,
    'lock_id', v_lock_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants — internal helpers locked down; field RPCs for authenticated
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_effective_table_capacity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_table_admission_passes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_table_capacity_available(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_entry_pass_with_qr(text, uuid, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_table_reservation_admission_status(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_field_table_reservation_atomic(
  uuid, uuid, uuid, int, uuid, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_field_table_passes_atomic(uuid, int, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_field_tickets_atomic(
  uuid, uuid, uuid, int, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_field_table_reservation_atomic(
  uuid, uuid, uuid, int, uuid, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_field_table_passes_atomic(uuid, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_field_tickets_atomic(
  uuid, uuid, uuid, int, uuid, text
) TO authenticated;
