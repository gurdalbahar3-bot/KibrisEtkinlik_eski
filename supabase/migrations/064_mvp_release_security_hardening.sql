-- 064 — MVP release security hardening (staging only; do NOT apply to production blindly)
-- Fixes:
--   1) expire_order_atomic: any authenticated caller may expire PAST-DUE pending holds
--      so expire_due_pending_orders_atomic can release inventory (was FORBIDDEN for others).
--   2) confirm_payment_atomic: RAISE on mid-body failures after payment insert (rollback).
--   3) handle_new_user: force account_type = customer (no client privilege escalation).
--   4) use_qr_atomic: refuse cancelled/inactive underlying ticket/pass entities.
--   5) reserve_table_atomic: order.total_amount = amount_due_now (deposit or base),
--      so iyzico charge matches checkout UI / deposit model.
--   6) Grant expire_due to service_role for cron.

-- ---------------------------------------------------------------------------
-- 1) Past-due expire ACL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_order_atomic(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ticket RECORD;
  v_past_due boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_FOUND');
  END IF;

  v_past_due :=
    v_order.status = 'pending_payment'
    AND v_order.expires_at IS NOT NULL
    AND v_order.expires_at < now();

  IF NOT (
    public.is_service_context()
    OR public.is_super_admin()
    OR v_order.customer_id = auth.uid()
    OR public.can_manage_event(v_order.event_id)
    OR v_past_due
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'noop', true);
  END IF;

  FOR v_ticket IN
    SELECT zone_id, count(*)::int AS qty
    FROM public.tickets
    WHERE order_id = p_order_id AND status = 'pending_payment'
    GROUP BY zone_id
  LOOP
    UPDATE public.event_ticket_zones
    SET reserved_count = GREATEST(reserved_count - v_ticket.qty, 0)
    WHERE id = v_ticket.zone_id;
  END LOOP;

  UPDATE public.tickets
  SET status = 'cancelled_by_organizer'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.seat_reservations
  SET status = 'cancelled'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.table_reservations
  SET status = 'cancelled_by_organizer'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.resource_locks
  SET status = 'released'
  WHERE order_id = p_order_id AND status = 'active';

  UPDATE public.orders
  SET status = 'expired', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_pending_orders_atomic()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_due_pending_orders_atomic()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) confirm_payment_atomic — abort transaction on capacity/guest failures
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
  v_existing_payment_id uuid;
  v_venue_remaining numeric := 0;
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
    SELECT p.id INTO v_existing_payment_id
    FROM public.payments AS p
    WHERE p.order_id = p_order_id
      AND p.status = 'succeeded'
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'payment_id', v_existing_payment_id,
      'noop', true
    );
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_PAYABLE');
  END IF;

  IF v_order.currency IS NULL OR btrim(v_order.currency) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_CURRENCY_MISSING');
  END IF;

  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_REQUIRED');
  END IF;

  IF p_provider_payment_id IS NULL OR btrim(p_provider_payment_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_PAYMENT_ID_REQUIRED');
  END IF;

  IF p_currency IS NULL OR upper(btrim(p_currency)) <> upper(btrim(v_order.currency)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CURRENCY_MISMATCH');
  END IF;

  IF p_amount IS NULL OR p_amount <> v_order.total_amount THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'AMOUNT_MISMATCH');
  END IF;

  BEGIN
    INSERT INTO public.payments (
      order_id, provider, provider_payment_id, amount, currency, status, payment_method, paid_at, created_at
    )
    VALUES (
      p_order_id, p_provider, p_provider_payment_id, p_amount, p_currency,
      'succeeded', p_payment_method, now(), now()
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT p.id INTO v_existing_payment_id
      FROM public.payments AS p
      WHERE p.provider = p_provider
        AND p.provider_payment_id = p_provider_payment_id
      LIMIT 1;

      IF v_existing_payment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders AS o
        WHERE o.id = p_order_id AND o.status = 'paid'
      ) THEN
        RETURN jsonb_build_object(
          'success', true,
          'order_id', p_order_id,
          'payment_id', v_existing_payment_id,
          'noop', true
        );
      END IF;

      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'DUPLICATE_PROVIDER_PAYMENT',
        'payment_id', v_existing_payment_id
      );
  END;

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
      RAISE EXCEPTION 'CONFIRM_PAYMENT_FAILED:GUEST_COUNT_REQUIRED';
    END IF;

    v_capacity_error := public.check_table_capacity_available(v_row.event_table_id, v_row.guest_count);
    IF v_capacity_error IS NOT NULL THEN
      RAISE EXCEPTION 'CONFIRM_PAYMENT_FAILED:%', v_capacity_error;
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
        v_venue_remaining := v_venue_remaining + v_row.snapshot_remaining_amount;
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
      amount_remaining = GREATEST(v_venue_remaining, v_order.total_amount - p_amount),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_id', v_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_atomic(
  uuid, text, text, numeric, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(
  uuid, text, text, numeric, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Force customer account_type on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Never trust client metadata for privilege. Organizer/venue_owner only via SA approval.
  INSERT INTO public.profiles (id, email, account_type)
  VALUES (NEW.id, NEW.email, 'customer')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) use_qr_atomic — gate on underlying entity status
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
  v_entity_ok boolean := false;
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
  ELSIF v_qr.status <> 'active' THEN
    v_scan_result := 'not_active';
  ELSE
    CASE v_qr.entity_type
      WHEN 'ticket' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.tickets AS t
          WHERE t.id = v_qr.entity_id AND t.status = 'active'
        ) INTO v_entity_ok;
      WHEN 'table_reservation' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.table_reservations AS tr
          WHERE tr.id = v_qr.entity_id AND tr.status = 'confirmed'
        ) INTO v_entity_ok;
      WHEN 'seat_reservation' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.seat_reservations AS sr
          WHERE sr.id = v_qr.entity_id AND sr.status = 'confirmed'
        ) INTO v_entity_ok;
      WHEN 'entry_pass' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.entry_passes AS ep
          WHERE ep.id = v_qr.entity_id AND ep.status = 'active'
        ) INTO v_entity_ok;
      ELSE
        v_entity_ok := false;
    END CASE;

    IF NOT v_entity_ok THEN
      v_scan_result := 'cancelled';
    ELSE
      v_scan_result := 'valid';
    END IF;
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

REVOKE ALL ON FUNCTION public.use_qr_atomic(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_qr_atomic(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) reserve_table_atomic — charge amount_due_now (deposit or full base)
--     Preserves 040 signature (optional p_order_id for mixed-cart resume).
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
  v_due_now numeric(12, 2);
  v_capacity_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  PERFORM public.expire_due_pending_orders_atomic();

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
  v_due_now := CASE WHEN v_deposit > 0 THEN v_deposit ELSE v_package.base_price END;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'table', p_table_id, 1,
    v_package.base_price, v_package.base_price, v_package.name,
    v_due_now
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
  SET subtotal_amount = subtotal_amount + v_due_now,
      total_amount = total_amount + v_due_now,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_id', v_order_item_id,
    'lock_id', v_lock_id,
    'expires_at', v_expires_at,
    'amount_due_now', v_due_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_table_atomic(uuid, uuid, uuid, int, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_table_atomic(uuid, uuid, uuid, int, uuid)
  TO authenticated;

-- Drop accidental 4-arg overload if created by an earlier draft of this migration.
DROP FUNCTION IF EXISTS public.reserve_table_atomic(uuid, uuid, uuid, int);

COMMENT ON FUNCTION public.expire_order_atomic(uuid) IS
  '064: past-due pending holds releasable by any authenticated caller (inventory safety).';
COMMENT ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text) IS
  '064: mid-body failures RAISE to roll back payment insert; service_role only.';
COMMENT ON FUNCTION public.handle_new_user() IS
  '064: always create customer profile; organizer elevation only via SA approval.';
COMMENT ON FUNCTION public.use_qr_atomic(text, text) IS
  '064: refuse scan when underlying ticket/pass/reservation is not active/confirmed.';
COMMENT ON FUNCTION public.reserve_table_atomic(uuid, uuid, uuid, int, uuid) IS
  '064: order.total_amount equals amount_due_now (deposit or base).';
