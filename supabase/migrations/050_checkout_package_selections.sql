-- Migration 050 — Checkout Package Selections
-- Scope: atomic writer for order_item_selections + create_mixed_cart_atomic integration.
-- Reuses: 046 package catalog (table_packages, package_items, package_item_options, package_upgrades, package_upgrade_options).
-- Depends on: 001–049 applied.
-- Does NOT modify: migrations 001–049, duplicate catalog tables, or parallel checkout flows.

BEGIN;

-- ============================================================
-- §1 Additive schema — item option FK on selections
-- ============================================================

ALTER TABLE public.order_item_selections
  ADD COLUMN package_item_option_id uuid NULL
    REFERENCES public.package_item_options (id);

CREATE INDEX order_item_selections_package_item_option_id_idx
  ON public.order_item_selections (package_item_option_id)
  WHERE package_item_option_id IS NOT NULL;

ALTER TABLE public.order_item_selections
  ADD CONSTRAINT order_item_selections_included_item_requires_item
    CHECK (
      selection_type <> 'included_item'
      OR package_item_id IS NOT NULL
    );

ALTER TABLE public.order_item_selections
  ADD CONSTRAINT order_item_selections_upgrade_requires_upgrade
    CHECK (
      selection_type <> 'upgrade'
      OR package_upgrade_id IS NOT NULL
    );

-- ============================================================
-- §2 Internal helper — assert writable table order item
-- ============================================================

CREATE OR REPLACE FUNCTION public.checkout_assert_table_order_item_writable(
  p_order_item_id uuid,
  p_package_id uuid
)
RETURNS TABLE (
  order_id uuid,
  event_id uuid,
  base_price numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_UNAUTHENTICATED';
  END IF;

  SELECT oi.* INTO v_item
  FROM public.order_items AS oi
  WHERE oi.id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND';
  END IF;

  IF v_item.item_type <> 'table' THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_TABLE';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = v_item.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.customer_id <> v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'ORDER_NOT_WRITABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.table_reservations AS tr
    WHERE tr.order_item_id = p_order_item_id
      AND tr.order_id = v_order.id
      AND tr.package_id = p_package_id
  ) THEN
    RAISE EXCEPTION 'PACKAGE_ORDER_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.table_packages AS tp
    WHERE tp.id = p_package_id
      AND tp.event_id = v_order.event_id
      AND tp.is_active
  ) THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
  END IF;

  order_id := v_order.id;
  event_id := v_order.event_id;
  base_price := v_item.unit_price;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- §3 Atomic package selection writer
-- ============================================================

CREATE OR REPLACE FUNCTION public.write_order_item_selections_atomic(
  p_order_item_id uuid,
  p_package_id uuid,
  p_selections jsonb,
  p_replace_existing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_event_id uuid;
  v_base_price numeric(12, 2);
  v_sel jsonb;
  v_selection_type text;
  v_item_id uuid;
  v_item_option_id uuid;
  v_upgrade_id uuid;
  v_upgrade_option_id uuid;
  v_quantity int;
  v_pkg_item public.package_items%ROWTYPE;
  v_upgrade public.package_upgrades%ROWTYPE;
  v_option_name text;
  v_upgrade_option_name text;
  v_unit_delta numeric(12, 2);
  v_line_delta numeric(12, 2);
  v_selection_ids uuid[] := ARRAY[]::uuid[];
  v_new_selection_id uuid;
  v_selection_delta numeric(12, 2) := 0;
  v_seen text[] := ARRAY[]::text[];
  v_key text;
  v_err text;
BEGIN
  SELECT a.order_id, a.event_id, a.base_price
  INTO v_order_id, v_event_id, v_base_price
  FROM public.checkout_assert_table_order_item_writable(p_order_item_id, p_package_id) AS a;

  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTIONS');
  END IF;

  IF p_replace_existing THEN
    DELETE FROM public.order_item_selections
    WHERE order_item_id = p_order_item_id;
  END IF;

  IF jsonb_array_length(p_selections) = 0 THEN
    UPDATE public.order_items
    SET total_price = v_base_price
    WHERE id = p_order_item_id;

    UPDATE public.table_reservations AS tr
    SET snapshot_total_amount = v_base_price,
        snapshot_remaining_amount = v_base_price - COALESCE(tr.snapshot_deposit_amount, 0)
    WHERE tr.order_item_id = p_order_item_id;

    UPDATE public.orders AS o
    SET subtotal_amount = (
          SELECT COALESCE(SUM(oi.total_price), 0)
          FROM public.order_items AS oi
          WHERE oi.order_id = o.id
        ),
        total_amount = (
          SELECT COALESCE(SUM(oi.total_price), 0)
          FROM public.order_items AS oi
          WHERE oi.order_id = o.id
        ),
        updated_at = now()
    WHERE o.id = v_order_id;

    RETURN jsonb_build_object(
      'success', true,
      'order_item_id', p_order_item_id,
      'selection_ids', '[]'::jsonb
    );
  END IF;

  FOR v_sel IN SELECT value FROM jsonb_array_elements(p_selections)
  LOOP
    IF v_sel ? 'unit_price_delta' OR v_sel ? 'line_total_delta' OR v_sel ? 'price' THEN
      RAISE EXCEPTION 'CLIENT_PRICE_REJECTED';
    END IF;

    v_selection_type := v_sel ->> 'selection_type';
    v_quantity := COALESCE(NULLIF(v_sel ->> 'quantity', '')::int, 1);

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    IF v_selection_type = 'included_item' THEN
      v_item_id := (v_sel ->> 'package_item_id')::uuid;
      v_item_option_id := NULLIF(v_sel ->> 'package_item_option_id', '')::uuid;

      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'PACKAGE_ITEM_REQUIRED';
      END IF;

      v_err := public.event_commerce_assert_item_in_package(p_package_id, v_item_id);
      IF v_err IS NOT NULL THEN
        RAISE EXCEPTION '%', v_err;
      END IF;

      SELECT * INTO v_pkg_item
      FROM public.package_items
      WHERE id = v_item_id;

      v_option_name := NULL;

      IF v_item_option_id IS NOT NULL THEN
        v_err := public.event_commerce_assert_item_option_in_package(
          p_package_id, v_item_id, v_item_option_id
        );
        IF v_err IS NOT NULL THEN
          RAISE EXCEPTION '%', v_err;
        END IF;

        SELECT pio.option_name, pio.price_delta
        INTO v_option_name, v_unit_delta
        FROM public.package_item_options AS pio
        WHERE pio.id = v_item_option_id;
      ELSE
        v_unit_delta := 0;
      END IF;

      IF v_pkg_item.is_customer_selectable THEN
        IF v_quantity < COALESCE(v_pkg_item.min_select, 0)
           OR v_quantity > COALESCE(v_pkg_item.max_select, 1) THEN
          RAISE EXCEPTION 'ITEM_QUANTITY_OUT_OF_RANGE';
        END IF;
      END IF;

      v_key := 'item:' || v_item_id::text || ':' || COALESCE(v_item_option_id::text, '');
      IF v_key = ANY (v_seen) THEN
        RAISE EXCEPTION 'DUPLICATE_SELECTION';
      END IF;
      v_seen := v_seen || v_key;

      v_line_delta := v_unit_delta * v_quantity;

      INSERT INTO public.order_item_selections (
        order_item_id,
        selection_type,
        package_item_id,
        package_item_option_id,
        snapshot_item_name,
        snapshot_option_name,
        snapshot_category,
        quantity,
        unit_price_delta,
        line_total_delta
      )
      VALUES (
        p_order_item_id,
        'included_item',
        v_item_id,
        v_item_option_id,
        v_pkg_item.name,
        v_option_name,
        v_pkg_item.item_category,
        v_quantity,
        v_unit_delta,
        v_line_delta
      )
      RETURNING id INTO v_new_selection_id;

    ELSIF v_selection_type = 'upgrade' THEN
      v_upgrade_id := (v_sel ->> 'package_upgrade_id')::uuid;
      v_upgrade_option_id := NULLIF(v_sel ->> 'upgrade_option_id', '')::uuid;

      IF v_upgrade_id IS NULL THEN
        RAISE EXCEPTION 'PACKAGE_UPGRADE_REQUIRED';
      END IF;

      v_err := public.event_commerce_assert_upgrade_in_package(p_package_id, v_upgrade_id);
      IF v_err IS NOT NULL THEN
        RAISE EXCEPTION '%', v_err;
      END IF;

      SELECT * INTO v_upgrade
      FROM public.package_upgrades
      WHERE id = v_upgrade_id;

      IF v_quantity > COALESCE(v_upgrade.max_quantity, 1) THEN
        RAISE EXCEPTION 'UPGRADE_QUANTITY_EXCEEDED';
      END IF;

      v_upgrade_option_name := NULL;

      IF v_upgrade_option_id IS NOT NULL THEN
        v_err := public.event_commerce_assert_upgrade_option_in_package(
          p_package_id, v_upgrade_id, v_upgrade_option_id
        );
        IF v_err IS NOT NULL THEN
          RAISE EXCEPTION '%', v_err;
        END IF;

        SELECT puo.option_name, puo.price_delta
        INTO v_upgrade_option_name, v_unit_delta
        FROM public.package_upgrade_options AS puo
        WHERE puo.id = v_upgrade_option_id;
      ELSE
        v_unit_delta := COALESCE(v_upgrade.price_delta, 0);
      END IF;

      v_key := 'upgrade:' || v_upgrade_id::text || ':' || COALESCE(v_upgrade_option_id::text, '');
      IF v_key = ANY (v_seen) THEN
        RAISE EXCEPTION 'DUPLICATE_SELECTION';
      END IF;
      v_seen := v_seen || v_key;

      v_line_delta := v_unit_delta * v_quantity;

      INSERT INTO public.order_item_selections (
        order_item_id,
        selection_type,
        package_upgrade_id,
        upgrade_option_id,
        snapshot_item_name,
        snapshot_option_name,
        snapshot_category,
        quantity,
        unit_price_delta,
        line_total_delta
      )
      VALUES (
        p_order_item_id,
        'upgrade',
        v_upgrade_id,
        v_upgrade_option_id,
        v_upgrade.name,
        v_upgrade_option_name,
        v_upgrade.upgrade_type,
        v_quantity,
        v_unit_delta,
        v_line_delta
      )
      RETURNING id INTO v_new_selection_id;

    ELSE
      RAISE EXCEPTION 'INVALID_SELECTION_TYPE';
    END IF;

    v_selection_ids := v_selection_ids || v_new_selection_id;
    v_selection_delta := v_selection_delta + v_line_delta;
  END LOOP;

  UPDATE public.order_items
  SET total_price = v_base_price + v_selection_delta
  WHERE id = p_order_item_id;

  UPDATE public.table_reservations AS tr
  SET snapshot_total_amount = v_base_price + v_selection_delta,
      snapshot_remaining_amount = (v_base_price + v_selection_delta) - COALESCE(tr.snapshot_deposit_amount, 0)
  WHERE tr.order_item_id = p_order_item_id;

  UPDATE public.orders AS o
  SET subtotal_amount = (
        SELECT COALESCE(SUM(oi.total_price), 0)
        FROM public.order_items AS oi
        WHERE oi.order_id = o.id
      ),
      total_amount = (
        SELECT COALESCE(SUM(oi.total_price), 0)
        FROM public.order_items AS oi
        WHERE oi.order_id = o.id
      ),
      updated_at = now()
  WHERE o.id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_item_id', p_order_item_id,
    'selection_ids', to_jsonb(v_selection_ids),
    'selection_delta', v_selection_delta
  );
END;
$$;

-- ============================================================
-- §4 Extend create_mixed_cart_atomic — table selections in same transaction
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_mixed_cart_atomic(
  p_event_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_order_id uuid;
  v_item jsonb;
  v_result jsonb;
  v_sel_result jsonb;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_order_item_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EMPTY_CART');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  IF v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEDDING_NOT_SELLABLE');
  END IF;

  INSERT INTO public.orders (customer_id, event_id, status, expires_at)
  VALUES (v_user_id, p_event_id, 'pending_payment', now() + interval '10 minutes')
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    CASE v_item ->> 'item_type'
      WHEN 'ticket' THEN
        v_result := public.reserve_ticket_capacity_atomic(
          p_event_id,
          (v_item ->> 'zone_id')::uuid,
          (v_item ->> 'ticket_type_id')::uuid,
          (v_item ->> 'quantity')::int,
          v_order_id
        );
      WHEN 'seat' THEN
        v_result := public.reserve_seat_atomic(
          p_event_id,
          (v_item ->> 'seat_id')::uuid,
          v_order_id
        );
      WHEN 'table' THEN
        v_result := public.reserve_table_atomic(
          p_event_id,
          (v_item ->> 'table_id')::uuid,
          (v_item ->> 'package_id')::uuid,
          NULLIF(v_item ->> 'guest_count', '')::int,
          v_order_id
        );
      ELSE
        RAISE EXCEPTION 'INVALID_ITEM_TYPE: %', v_item ->> 'item_type';
    END CASE;

    IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'CART_ITEM_FAILED: %', COALESCE(v_result ->> 'error_code', 'UNKNOWN');
    END IF;

    v_order_item_id := (v_result ->> 'order_item_id')::uuid;
    v_item_ids := v_item_ids || v_order_item_id;

    IF v_item ->> 'item_type' = 'table'
       AND v_item ? 'selections'
       AND jsonb_typeof(v_item -> 'selections') = 'array'
       AND jsonb_array_length(v_item -> 'selections') > 0 THEN
      v_sel_result := public.write_order_item_selections_atomic(
        v_order_item_id,
        (v_item ->> 'package_id')::uuid,
        v_item -> 'selections',
        true
      );

      IF NOT COALESCE((v_sel_result ->> 'success')::boolean, false) THEN
        RAISE EXCEPTION 'SELECTIONS_FAILED: %', COALESCE(v_sel_result ->> 'error_code', 'UNKNOWN');
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_ids', to_jsonb(v_item_ids)
  );
END;
$$;

-- ============================================================
-- §5 REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.checkout_assert_table_order_item_writable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_order_item_selections_atomic(uuid, uuid, jsonb, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.write_order_item_selections_atomic(uuid, uuid, jsonb, boolean) TO authenticated;

COMMIT;

-- Post-apply verification (manual):
-- SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND proname IN ('write_order_item_selections_atomic', 'create_mixed_cart_atomic');
