-- P0.8C Commerce Security Hardening
-- Staging-only
-- Production intentionally untouched
-- Do not replay 051-055
-- Does NOT modify 058 / 059 / 060 files
--
-- Closes:
--   P0-SEC-001 Organizer commerce RPC anon EXECUTE
--   P0-SEC-002 Commerce catalog table direct DML
--   P0-SEC-003 Zone/type SQL draft gate (NOT_DRAFT)
--   P0-SEC-004 confirm/fail_payment ACL → service_role only
--
-- Leaves B/D customer/admission RPCs executable by authenticated
-- (reserve_ticket_capacity_atomic, create_mixed_cart_atomic,
--  check_in_scan_atomic, use_qr_atomic, …).
-- Draft gate aligns with 059/060: draft-only for ALL managers including SA.
-- Audit_logs intentionally deferred (P1).

BEGIN;

-- ============================================================
-- §1 Zone/type bodies + SQL draft gate (staging signatures)
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
  v_status text;
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

  SELECT e.status::text
  INTO v_status
  FROM public.events AS e
  WHERE e.id = p_event_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_DRAFT');
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
  v_status text;
  v_block_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT e.status::text
  INTO v_status
  FROM public.events AS e
  WHERE e.id = p_event_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_DRAFT');
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

CREATE OR REPLACE FUNCTION public.upsert_event_ticket_type(
  p_event_id uuid,
  p_zone_id uuid,
  p_name text,
  p_price numeric,
  p_description text DEFAULT NULL,
  p_max_per_order integer DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_ticket_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_zone public.event_ticket_zones%ROWTYPE;
  v_id uuid := p_ticket_type_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT e.status::text
  INTO v_status
  FROM public.events AS e
  WHERE e.id = p_event_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_DRAFT');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = p_zone_id;
  IF NOT FOUND OR v_zone.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
  END IF;

  IF v_zone.sale_mode <> 'ticket_based' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_SALE_MODE');
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.event_ticket_types (
      event_id, zone_id, name, price, description, max_per_order, is_active
    )
    VALUES (p_event_id, p_zone_id, p_name, p_price, p_description, p_max_per_order, p_is_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.event_ticket_types
    SET zone_id = p_zone_id,
        name = p_name,
        price = p_price,
        description = p_description,
        max_per_order = p_max_per_order,
        is_active = p_is_active
    WHERE id = v_id AND event_id = p_event_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'ticket_type_id', v_id);
END;
$$;

COMMENT ON FUNCTION public.upsert_event_ticket_zone_atomic(
  uuid, text, text, text, integer, uuid, text, integer, boolean, uuid
) IS
  'Organizer zone upsert. Draft + can_manage_event. Staging 061 P0.8C.';

COMMENT ON FUNCTION public.deactivate_event_ticket_zone_atomic(uuid, uuid) IS
  'Organizer zone deactivate. Draft + can_manage_event. Staging 061 P0.8C.';

COMMENT ON FUNCTION public.upsert_event_ticket_type(
  uuid, uuid, text, numeric, text, integer, boolean, uuid
) IS
  'Organizer ticket type upsert. Draft + can_manage_event. Staging 061 P0.8C.';

-- ============================================================
-- §2 Organizer commerce mutator ACL (A) — revoke anon/PUBLIC
-- Identity args from staging pg_get_function_identity_arguments
-- ============================================================

REVOKE ALL ON FUNCTION public.upsert_event_ticket_zone_atomic(uuid, text, text, text, integer, uuid, text, integer, boolean, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_event_ticket_zone_atomic(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_event_ticket_type(uuid, uuid, text, numeric, text, integer, boolean, uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_event_seat_pricing(uuid, uuid, uuid, numeric, numeric, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_event_seat_pricing_batch_atomic(uuid, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_event_seat_pricing_atomic(uuid, uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.block_event_resource_atomic(uuid, text, uuid, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_event_resource_atomic(uuid, uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_event_sale_category_atomic(uuid, text, text, boolean, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_event_sale_category_atomic(uuid, uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_table_package_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_table_package_atomic(uuid, uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_package_item_atomic(uuid, uuid, text, text, integer, text, boolean, boolean, integer, integer, integer, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_package_item_atomic(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_package_item_option_atomic(uuid, uuid, uuid, text, boolean, numeric, integer, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_package_item_option_atomic(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_package_upgrade_atomic(uuid, uuid, text, text, numeric, text, integer, integer, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_package_upgrade_atomic(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_package_upgrade_option_atomic(uuid, uuid, uuid, text, numeric, uuid, integer, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_package_upgrade_option_atomic(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_event_ticket_zone_atomic(uuid, text, text, text, integer, uuid, text, integer, boolean, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_event_ticket_zone_atomic(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_ticket_type(uuid, uuid, text, numeric, text, integer, boolean, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_event_seat_pricing(uuid, uuid, uuid, numeric, numeric, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_seat_pricing_batch_atomic(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_seat_pricing_atomic(uuid, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.block_event_resource_atomic(uuid, text, uuid, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_event_resource_atomic(uuid, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_event_sale_category_atomic(uuid, text, text, boolean, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_event_sale_category_atomic(uuid, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_table_package_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_table_package_atomic(uuid, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_package_item_atomic(uuid, uuid, text, text, integer, text, boolean, boolean, integer, integer, integer, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_item_atomic(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_package_item_option_atomic(uuid, uuid, uuid, text, boolean, numeric, integer, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_item_option_atomic(uuid, uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_package_upgrade_atomic(uuid, uuid, text, text, numeric, text, integer, integer, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_upgrade_atomic(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_package_upgrade_option_atomic(uuid, uuid, uuid, text, numeric, uuid, integer, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_upgrade_option_atomic(uuid, uuid, uuid, uuid)
  TO authenticated;

-- ============================================================
-- §3 Catalog table DML revoke (keep SELECT) — artists 060 pattern
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_ticket_zones
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_ticket_types
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_seat_pricing
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_sale_categories
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.table_packages
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.package_items
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.package_item_options
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.package_upgrades
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.package_upgrade_options
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- §4 Payment ACL — service_role only (body gates unchanged)
-- ============================================================

REVOKE ALL ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_payment_atomic(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_atomic(uuid, text, text, text)
  TO service_role;

COMMIT;
