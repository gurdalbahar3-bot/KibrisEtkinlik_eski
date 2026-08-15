-- Migration 045 — Event Commerce Setup
-- Scope: event sales catalog mutation RPCs (zones, packages, blocks, seat pricing batch/delete).
-- Auth: can_manage_event (organizer / event staff).
-- Depends on: 014–018, 033, 034, 037, 038, 044.
-- Does NOT modify: 001–044, 040/041 admission/check-in, 042/043 venue master, 044 layout,
--                   existing 034 RPC bodies, reservation/payment/publish RPCs.

BEGIN;

-- ============================================================
-- §1 Internal helpers (REVOKE PUBLIC only — not granted to authenticated)
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_commerce_raise_if_rpc_failed(p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_result IS NULL OR COALESCE((p_result->>'success')::boolean, false) = false THEN
    RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', COALESCE(p_result->>'error_code', 'UNKNOWN')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_area_in_event_venue(
  p_event_id uuid,
  p_area_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_venue_id uuid;
BEGIN
  SELECT e.venue_id
  INTO v_event_venue_id
  FROM public.events AS e
  WHERE e.id = p_event_id;

  IF v_event_venue_id IS NULL THEN
    RETURN 'EVENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_areas AS va
    WHERE va.id = p_area_id
      AND va.venue_id = v_event_venue_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.venue_areas WHERE id = p_area_id) THEN
      RETURN 'AREA_VENUE_MISMATCH';
    END IF;
    RETURN 'RESOURCE_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_block_resource(
  p_event_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_resource_type IN ('table', 'seat') THEN
    RETURN public.event_layout_assert_resource_in_event_venue(
      p_event_id,
      p_resource_type,
      p_resource_id
    );
  END IF;

  IF p_resource_type = 'zone' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.event_ticket_zones AS z
      WHERE z.id = p_resource_id
        AND z.event_id = p_event_id
    ) THEN
      IF EXISTS (SELECT 1 FROM public.event_ticket_zones WHERE id = p_resource_id) THEN
        RETURN 'ZONE_NOT_FOUND';
      END IF;
      RETURN 'RESOURCE_NOT_FOUND';
    END IF;
    RETURN NULL;
  END IF;

  RETURN 'INVALID_RESOURCE_TYPE';
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_zone_is_deactivatable(
  p_event_id uuid,
  p_zone_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone public.event_ticket_zones%ROWTYPE;
BEGIN
  SELECT * INTO v_zone
  FROM public.event_ticket_zones
  WHERE id = p_zone_id AND event_id = p_event_id;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.event_ticket_zones WHERE id = p_zone_id) THEN
      RETURN 'ZONE_NOT_FOUND';
    END IF;
    RETURN 'ZONE_NOT_FOUND';
  END IF;

  IF v_zone.reserved_count > 0 OR v_zone.sold_count > 0 THEN
    RETURN 'ZONE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tickets AS t
    WHERE t.zone_id = p_zone_id
      AND t.status IN ('pending_payment', 'active', 'transferred', 'used')
  ) THEN
    RETURN 'ZONE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.seat_reservations AS sr
    JOIN public.event_seat_pricing AS esp
      ON esp.event_id = sr.event_id
     AND esp.seat_id = sr.seat_id
    WHERE esp.zone_id = p_zone_id
      AND sr.status IN ('pending_payment', 'confirmed', 'transferred', 'used')
  ) THEN
    RETURN 'ZONE_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_package_is_deactivatable(p_package_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.table_reservations AS tr
    WHERE tr.package_id = p_package_id
      AND tr.status IN ('pending_payment', 'confirmed', 'transferred', 'used')
  ) THEN
    RETURN 'PACKAGE_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_seat_pricing_is_deletable(
  p_event_id uuid,
  p_seat_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resource_error text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.event_seat_pricing
    WHERE event_id = p_event_id AND seat_id = p_seat_id
  ) THEN
    RETURN 'SEAT_PRICING_NOT_FOUND';
  END IF;

  v_resource_error := public.event_layout_assert_resource_in_event_venue(
    p_event_id,
    'seat',
    p_seat_id
  );
  IF v_resource_error IS NOT NULL THEN
    RETURN v_resource_error;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.seat_reservations AS sr
    WHERE sr.event_id = p_event_id
      AND sr.seat_id = p_seat_id
      AND sr.status IN ('pending_payment', 'confirmed', 'transferred', 'used')
  ) THEN
    RETURN 'SEAT_PRICING_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.resource_locks AS rl
    WHERE rl.event_id = p_event_id
      AND rl.resource_type = 'seat'
      AND rl.resource_id = p_seat_id
      AND rl.status = 'active'
  ) THEN
    RETURN 'SEAT_PRICING_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- §2 event_ticket_zones lifecycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_event_ticket_zone_atomic(
  p_event_id uuid,
  p_name text,
  p_zone_type text,
  p_sale_mode text,
  p_capacity integer,
  p_venue_area_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_zone_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_area_error text;
  v_existing public.event_ticket_zones%ROWTYPE;
  v_id uuid := p_zone_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_zone_type IS NULL OR p_zone_type NOT IN ('standard', 'front_row', 'vip', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ZONE_TYPE');
  END IF;

  IF p_sale_mode IS NULL OR p_sale_mode NOT IN ('ticket_based', 'seat_based') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SALE_MODE');
  END IF;

  IF p_capacity IS NULL OR p_capacity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CAPACITY');
  END IF;

  IF p_venue_area_id IS NOT NULL THEN
    v_area_error := public.event_commerce_assert_area_in_event_venue(p_event_id, p_venue_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.event_ticket_zones
    WHERE id = v_id;

    IF NOT FOUND OR v_existing.event_id <> p_event_id THEN
      IF FOUND AND v_existing.event_id <> p_event_id THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
    END IF;

    IF p_sale_mode = 'seat_based'
       AND v_existing.sale_mode <> 'seat_based'
       AND (v_existing.reserved_count <> 0 OR v_existing.sold_count <> 0) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_IN_USE');
    END IF;

    UPDATE public.event_ticket_zones
    SET name = p_name,
        zone_type = p_zone_type,
        sale_mode = p_sale_mode,
        capacity = p_capacity,
        venue_area_id = COALESCE(p_venue_area_id, v_existing.venue_area_id),
        description = COALESCE(p_description, v_existing.description),
        sort_order = COALESCE(p_sort_order, v_existing.sort_order),
        is_active = p_is_active
    WHERE id = v_id AND event_id = p_event_id;

    RETURN jsonb_build_object('success', true, 'zone_id', v_id, 'event_id', p_event_id);
  END IF;

  INSERT INTO public.event_ticket_zones (
    event_id, name, zone_type, sale_mode, venue_area_id,
    capacity, description, sort_order, is_active
  )
  VALUES (
    p_event_id, p_name, p_zone_type, p_sale_mode, p_venue_area_id,
    p_capacity, p_description, p_sort_order, p_is_active
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'zone_id', v_id, 'event_id', p_event_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NAME_CONFLICT');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CAPACITY');
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_event_ticket_zone_atomic(
  p_event_id uuid,
  p_zone_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_block_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_block_error := public.event_commerce_zone_is_deactivatable(p_event_id, p_zone_id);
  IF v_block_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_block_error);
  END IF;

  UPDATE public.event_ticket_zones
  SET is_active = false
  WHERE id = p_zone_id AND event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true, 'zone_id', p_zone_id, 'event_id', p_event_id);
END;
$$;

-- ============================================================
-- §3 table_packages lifecycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_table_package_atomic(
  p_event_id uuid,
  p_event_table_id uuid,
  p_name text,
  p_base_price numeric,
  p_deposit_amount numeric DEFAULT NULL,
  p_sale_category text DEFAULT 'table',
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_package_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid := p_package_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_base_price IS NULL OR p_base_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  IF p_sale_category IS NULL OR p_sale_category NOT IN ('table', 'bistro', 'vip') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SALE_CATEGORY');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.event_tables AS et
    WHERE et.id = p_event_table_id
      AND et.event_id = p_event_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.event_tables WHERE id = p_event_table_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_EVENT_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_NOT_FOUND');
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.table_packages (
      event_id, event_table_id, name, base_price, deposit_amount,
      sale_category, description, is_active
    )
    VALUES (
      p_event_id, p_event_table_id, p_name, p_base_price, p_deposit_amount,
      p_sale_category, p_description, p_is_active
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.table_packages
    SET event_table_id = p_event_table_id,
        name = p_name,
        base_price = p_base_price,
        deposit_amount = COALESCE(p_deposit_amount, table_packages.deposit_amount),
        sale_category = p_sale_category,
        description = COALESCE(p_description, table_packages.description),
        is_active = p_is_active,
        updated_at = now()
    WHERE id = v_id AND event_id = p_event_id;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.table_packages WHERE id = v_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'package_id', v_id,
    'event_id', p_event_id,
    'event_table_id', p_event_table_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SALE_CATEGORY');
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_table_package_atomic(
  p_event_id uuid,
  p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_package public.table_packages%ROWTYPE;
  v_block_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_package
  FROM public.table_packages
  WHERE id = p_package_id FOR UPDATE;

  IF NOT FOUND OR v_package.event_id <> p_event_id THEN
    IF FOUND AND v_package.event_id <> p_event_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
  END IF;

  IF NOT v_package.is_active THEN
    RETURN jsonb_build_object('success', true, 'package_id', p_package_id, 'noop', true);
  END IF;

  v_block_error := public.event_commerce_package_is_deactivatable(p_package_id);
  IF v_block_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_block_error);
  END IF;

  UPDATE public.table_packages
  SET is_active = false, updated_at = now()
  WHERE id = p_package_id AND event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'package_id', p_package_id, 'event_id', p_event_id);
END;
$$;

-- ============================================================
-- §4 event_resource_blocks block / unblock
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_event_resource_atomic(
  p_event_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_block_type text,
  p_reason text DEFAULT NULL,
  p_operation_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_resource_error text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF p_resource_type NOT IN ('table', 'seat', 'zone') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_RESOURCE_TYPE');
  END IF;

  IF p_block_type NOT IN (
    'protocol', 'vip_guest', 'technical', 'out_of_service', 'business_use'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_BLOCK_TYPE');
  END IF;

  IF p_operation_reason IS NOT NULL AND p_operation_reason NOT IN (
    'field_reservation', 'venue_guest', 'organization_reservation',
    'vip_hold', 'temporary_hold', 'out_of_service'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_OPERATION_REASON');
  END IF;

  v_resource_error := public.event_commerce_assert_block_resource(
    p_event_id, p_resource_type, p_resource_id
  );
  IF v_resource_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_resource_error);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.event_resource_blocks AS erb
    WHERE erb.event_id = p_event_id
      AND erb.resource_type = p_resource_type
      AND erb.resource_id = p_resource_id
      AND erb.is_active
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESOURCE_ALREADY_BLOCKED');
  END IF;

  IF p_resource_type = 'seat' AND EXISTS (
    SELECT 1 FROM public.seat_reservations
    WHERE event_id = p_event_id AND seat_id = p_resource_id
      AND status IN ('confirmed', 'used', 'transferred')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESOURCE_ALREADY_SOLD');
  END IF;

  IF p_resource_type = 'table' AND EXISTS (
    SELECT 1 FROM public.table_reservations
    WHERE event_id = p_event_id AND table_id = p_resource_id
      AND status IN ('confirmed', 'used', 'transferred')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESOURCE_ALREADY_SOLD');
  END IF;

  INSERT INTO public.event_resource_blocks (
    event_id, resource_type, resource_id, block_type, reason,
    operation_reason, blocked_by, is_active
  )
  VALUES (
    p_event_id, p_resource_type, p_resource_id, p_block_type, p_reason,
    p_operation_reason, v_user_id, true
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'block_id', v_id, 'event_id', p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_event_resource_atomic(
  p_event_id uuid,
  p_block_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_block public.event_resource_blocks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_block
  FROM public.event_resource_blocks
  WHERE id = p_block_id FOR UPDATE;

  IF NOT FOUND OR v_block.event_id <> p_event_id THEN
    IF FOUND AND v_block.event_id <> p_event_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'BLOCK_NOT_FOUND');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'BLOCK_NOT_FOUND');
  END IF;

  IF NOT v_block.is_active THEN
    RETURN jsonb_build_object('success', true, 'block_id', p_block_id, 'noop', true);
  END IF;

  UPDATE public.event_resource_blocks
  SET is_active = false, updated_at = now()
  WHERE id = p_block_id AND event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'block_id', p_block_id, 'event_id', p_event_id);
END;
$$;

-- ============================================================
-- §5 event_seat_pricing delete + batch
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_event_seat_pricing_atomic(
  p_event_id uuid,
  p_seat_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_delete_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_delete_error := public.event_commerce_seat_pricing_is_deletable(p_event_id, p_seat_id);
  IF v_delete_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_delete_error);
  END IF;

  DELETE FROM public.event_seat_pricing
  WHERE event_id = p_event_id AND seat_id = p_seat_id;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'seat_id', p_seat_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_event_seat_pricing_batch_atomic(
  p_event_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_result jsonb;
  v_total integer;
  v_seat_id uuid;
  v_zone_id uuid;
  v_resource_error text;
  v_delete_error text;
  v_zone public.event_ticket_zones%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  v_total := jsonb_array_length(COALESCE(p_items, '[]'::jsonb));

  IF v_total > 200 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'BATCH_LIMIT_EXCEEDED');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_seat_id := NULLIF(v_item->>'seat_id', '')::uuid;

    IF v_seat_id IS NULL THEN
      RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'RESOURCE_NOT_FOUND'
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE((v_item->>'delete')::boolean, false) THEN
      v_result := public.delete_event_seat_pricing_atomic(p_event_id, v_seat_id);
      PERFORM public.event_commerce_raise_if_rpc_failed(v_result);
      CONTINUE;
    END IF;

    v_resource_error := public.event_layout_assert_resource_in_event_venue(
      p_event_id, 'seat', v_seat_id
    );
    IF v_resource_error IS NOT NULL THEN
      RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', v_resource_error
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.event_seat_pricing
      WHERE event_id = p_event_id AND seat_id = v_seat_id
    ) THEN
      IF v_item ? 'zone_id' THEN
        v_zone_id := NULLIF(v_item->>'zone_id', '')::uuid;
        IF v_zone_id IS NULL THEN
          RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'ZONE_NOT_FOUND'
            USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = v_zone_id;
        IF NOT FOUND OR v_zone.event_id <> p_event_id THEN
          RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'ZONE_NOT_FOUND'
            USING ERRCODE = 'P0001';
        END IF;

        IF v_zone.sale_mode <> 'seat_based' THEN
          RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'WRONG_SALE_MODE'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF v_item ? 'price' AND NULLIF(v_item->>'price', '') IS NOT NULL
         AND NULLIF(v_item->>'price', '')::numeric < 0 THEN
        RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'INVALID_PRICE'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.event_seat_pricing AS esp
      SET zone_id = CASE
            WHEN v_item ? 'zone_id' THEN NULLIF(v_item->>'zone_id', '')::uuid
            ELSE esp.zone_id
          END,
          price = CASE
            WHEN v_item ? 'price' THEN NULLIF(v_item->>'price', '')::numeric
            ELSE esp.price
          END,
          deposit_amount = CASE
            WHEN v_item ? 'deposit_amount' THEN NULLIF(v_item->>'deposit_amount', '')::numeric
            ELSE esp.deposit_amount
          END,
          is_sellable = CASE
            WHEN v_item ? 'is_sellable' THEN (v_item->>'is_sellable')::boolean
            ELSE esp.is_sellable
          END
      WHERE esp.event_id = p_event_id AND esp.seat_id = v_seat_id;
    ELSE
      v_zone_id := NULLIF(v_item->>'zone_id', '')::uuid;

      IF v_zone_id IS NULL THEN
        RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'ZONE_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      IF NOT v_item ? 'price' OR NULLIF(v_item->>'price', '') IS NULL THEN
        RAISE EXCEPTION 'EVENT_COMMERCE_RPC_FAILED:%', 'INVALID_PRICE'
          USING ERRCODE = 'P0001';
      END IF;

      v_result := public.upsert_event_seat_pricing(
        p_event_id,
        v_seat_id,
        v_zone_id,
        NULLIF(v_item->>'price', '')::numeric,
        CASE
          WHEN v_item ? 'deposit_amount' THEN NULLIF(v_item->>'deposit_amount', '')::numeric
          ELSE NULL
        END,
        CASE
          WHEN v_item ? 'is_sellable' THEN (v_item->>'is_sellable')::boolean
          ELSE true
        END
      );
      PERFORM public.event_commerce_raise_if_rpc_failed(v_result);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'processed_count', v_total
  );
END;
$$;

-- ============================================================
-- §6 REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.event_commerce_raise_if_rpc_failed(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_area_in_event_venue(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_block_resource(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_zone_is_deactivatable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_package_is_deactivatable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_seat_pricing_is_deletable(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_event_ticket_zone_atomic(
  uuid, text, text, text, integer, uuid, text, integer, boolean, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_event_ticket_zone_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_table_package_atomic(
  uuid, uuid, text, numeric, numeric, text, text, boolean, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_table_package_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_event_resource_atomic(
  uuid, text, uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unblock_event_resource_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_event_seat_pricing_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_event_seat_pricing_batch_atomic(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_event_ticket_zone_atomic(
  uuid, text, text, text, integer, uuid, text, integer, boolean, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_event_ticket_zone_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_table_package_atomic(
  uuid, uuid, text, numeric, numeric, text, text, boolean, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_table_package_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_event_resource_atomic(
  uuid, text, uuid, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_event_resource_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_seat_pricing_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_seat_pricing_batch_atomic(uuid, jsonb) TO authenticated;

COMMIT;
