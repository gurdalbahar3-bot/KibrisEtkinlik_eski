-- Migration 046 — Event Commerce Package Catalog
-- Scope: package children (items, options, upgrades) + event_sale_categories mutation RPCs.
-- Auth: can_manage_event (organizer / event staff).
-- Depends on: 018, 021, 034, 037, 045.
-- Does NOT modify: 001–045, existing 034/040/041/042/043/044/045 RPC bodies, reservation/payment/checkout RPCs.

BEGIN;

-- ============================================================
-- §1 Internal helpers (REVOKE PUBLIC only — not granted to authenticated)
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_commerce_assert_package_in_event(
  p_event_id uuid,
  p_package_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.table_packages AS tp
    WHERE tp.id = p_package_id
      AND tp.event_id = p_event_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.table_packages WHERE id = p_package_id) THEN
      RETURN 'PACKAGE_NOT_FOUND';
    END IF;
    RETURN 'PACKAGE_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_item_in_package(
  p_package_id uuid,
  p_item_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.package_items AS pi
    WHERE pi.id = p_item_id
      AND pi.package_id = p_package_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.package_items WHERE id = p_item_id) THEN
      RETURN 'PACKAGE_ITEM_NOT_FOUND';
    END IF;
    RETURN 'PACKAGE_ITEM_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_item_option_in_package(
  p_package_id uuid,
  p_item_id uuid,
  p_option_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.package_item_options AS pio
    JOIN public.package_items AS pi ON pi.id = pio.package_item_id
    WHERE pio.id = p_option_id
      AND pi.id = p_item_id
      AND pi.package_id = p_package_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.package_item_options WHERE id = p_option_id) THEN
      RETURN 'PACKAGE_ITEM_OPTION_NOT_FOUND';
    END IF;
    RETURN 'PACKAGE_ITEM_OPTION_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_upgrade_in_package(
  p_package_id uuid,
  p_upgrade_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.package_upgrades AS pu
    WHERE pu.id = p_upgrade_id
      AND pu.package_id = p_package_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.package_upgrades WHERE id = p_upgrade_id) THEN
      RETURN 'PACKAGE_UPGRADE_NOT_FOUND';
    END IF;
    RETURN 'PACKAGE_UPGRADE_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_upgrade_option_in_package(
  p_package_id uuid,
  p_upgrade_id uuid,
  p_option_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.package_upgrade_options AS puo
    JOIN public.package_upgrades AS pu ON pu.id = puo.upgrade_id
    WHERE puo.id = p_option_id
      AND pu.id = p_upgrade_id
      AND pu.package_id = p_package_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.package_upgrade_options WHERE id = p_option_id) THEN
      RETURN 'PACKAGE_UPGRADE_OPTION_NOT_FOUND';
    END IF;
    RETURN 'PACKAGE_UPGRADE_OPTION_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_assert_linked_item_same_package(
  p_package_id uuid,
  p_linked_item_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_linked_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.package_items AS pi
    WHERE pi.id = p_linked_item_id
      AND pi.package_id = p_package_id
  ) THEN
    RETURN 'LINKED_ITEM_PACKAGE_MISMATCH';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_validate_sale_category_mapping(
  p_category text,
  p_fulfillment_mode text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_category IS NULL OR p_category NOT IN ('general_admission', 'table', 'bistro', 'vip') THEN
    RETURN 'INVALID_SALE_CATEGORY';
  END IF;

  IF p_fulfillment_mode IS NULL OR p_fulfillment_mode NOT IN ('ticket', 'seat', 'table') THEN
    RETURN 'INVALID_FULFILLMENT_MODE';
  END IF;

  IF NOT (
    (p_category = 'general_admission' AND p_fulfillment_mode = 'ticket')
    OR (p_category = 'table' AND p_fulfillment_mode = 'table')
    OR (p_category = 'bistro' AND p_fulfillment_mode = 'table')
    OR (p_category = 'vip' AND p_fulfillment_mode IN ('ticket', 'seat', 'table'))
  ) THEN
    RETURN 'INVALID_CATEGORY_FULFILLMENT_MAPPING';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_package_item_is_deletable(p_item_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.package_item_options AS pio
    WHERE pio.package_item_id = p_item_id
  ) THEN
    RETURN 'PACKAGE_ITEM_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.package_upgrade_options AS puo
    WHERE puo.linked_package_item_id = p_item_id
  ) THEN
    RETURN 'PACKAGE_ITEM_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_item_selections AS ois
    WHERE ois.package_item_id = p_item_id
  ) THEN
    RETURN 'PACKAGE_ITEM_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_package_item_option_is_deletable(
  p_option_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  SELECT pio.package_item_id
  INTO v_item_id
  FROM public.package_item_options AS pio
  WHERE pio.id = p_option_id;

  IF v_item_id IS NULL THEN
    RETURN 'PACKAGE_ITEM_OPTION_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_item_selections AS ois
    WHERE ois.package_item_id = v_item_id
  ) THEN
    RETURN 'PACKAGE_ITEM_OPTION_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_package_upgrade_is_deletable(p_upgrade_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.package_upgrade_options AS puo
    WHERE puo.upgrade_id = p_upgrade_id
  ) THEN
    RETURN 'PACKAGE_UPGRADE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_item_selections AS ois
    WHERE ois.package_upgrade_id = p_upgrade_id
  ) THEN
    RETURN 'PACKAGE_UPGRADE_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_commerce_package_upgrade_option_is_deletable(
  p_option_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.order_item_selections AS ois
    WHERE ois.upgrade_option_id = p_option_id
  ) THEN
    RETURN 'PACKAGE_UPGRADE_OPTION_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- §2 package_items
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_package_item_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_name text,
  p_item_category text,
  p_quantity integer DEFAULT 1,
  p_unit_label text DEFAULT NULL,
  p_is_default_included boolean DEFAULT NULL,
  p_is_customer_selectable boolean DEFAULT NULL,
  p_min_select integer DEFAULT NULL,
  p_max_select integer DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_existing public.package_items%ROWTYPE;
  v_id uuid := p_item_id;
  v_min_select integer;
  v_max_select integer;
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

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_item_category IS NULL OR p_item_category NOT IN (
    'beverage', 'soft_drink', 'water', 'food', 'fruit', 'other'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ITEM_CATEGORY');
  END IF;

  IF v_id IS NULL THEN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
    END IF;

    v_min_select := p_min_select;
    v_max_select := p_max_select;

    IF v_min_select IS NOT NULL AND v_min_select < 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTION_RANGE');
    END IF;

    IF v_max_select IS NOT NULL AND v_max_select < 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTION_RANGE');
    END IF;

    IF v_min_select IS NOT NULL AND v_max_select IS NOT NULL AND v_max_select < v_min_select THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTION_RANGE');
    END IF;

    INSERT INTO public.package_items (
      package_id, name, item_category, quantity, unit_label,
      is_default_included, is_customer_selectable, min_select, max_select, sort_order
    )
    VALUES (
      p_package_id, p_name, p_item_category, p_quantity, p_unit_label,
      COALESCE(p_is_default_included, true),
      COALESCE(p_is_customer_selectable, false),
      p_min_select, p_max_select, p_sort_order
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.package_items
    WHERE id = v_id;

    IF NOT FOUND OR v_existing.package_id <> p_package_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_ITEM_NOT_FOUND');
    END IF;

    IF p_quantity IS NOT NULL AND p_quantity <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
    END IF;

    v_min_select := COALESCE(p_min_select, v_existing.min_select);
    v_max_select := COALESCE(p_max_select, v_existing.max_select);

    IF v_min_select IS NOT NULL AND v_min_select < 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTION_RANGE');
    END IF;

    IF v_max_select IS NOT NULL AND v_max_select < 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTION_RANGE');
    END IF;

    IF v_min_select IS NOT NULL AND v_max_select IS NOT NULL AND v_max_select < v_min_select THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SELECTION_RANGE');
    END IF;

    UPDATE public.package_items
    SET name = p_name,
        item_category = p_item_category,
        quantity = COALESCE(p_quantity, package_items.quantity),
        unit_label = COALESCE(p_unit_label, package_items.unit_label),
        is_default_included = COALESCE(p_is_default_included, v_existing.is_default_included),
        is_customer_selectable = COALESCE(p_is_customer_selectable, v_existing.is_customer_selectable),
        min_select = COALESCE(p_min_select, package_items.min_select),
        max_select = COALESCE(p_max_select, package_items.max_select),
        sort_order = COALESCE(p_sort_order, package_items.sort_order)
    WHERE id = v_id AND package_id = p_package_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'item_id', v_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ITEM_CATEGORY');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_package_item_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_delete_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_scope_error := public.event_commerce_assert_item_in_package(p_package_id, p_item_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_delete_error := public.event_commerce_package_item_is_deletable(p_item_id);
  IF v_delete_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_delete_error);
  END IF;

  DELETE FROM public.package_items
  WHERE id = p_item_id AND package_id = p_package_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'item_id', p_item_id
  );
END;
$$;

-- ============================================================
-- §3 package_item_options
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_package_item_option_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_item_id uuid,
  p_option_name text,
  p_is_default boolean DEFAULT NULL,
  p_price_delta numeric DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_id uuid := p_option_id;
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

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_scope_error := public.event_commerce_assert_item_in_package(p_package_id, p_item_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  IF p_option_name IS NULL OR btrim(p_option_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_price_delta IS NOT NULL AND p_price_delta < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.package_item_options (
      package_item_id, option_name, is_default, price_delta, sort_order
    )
    VALUES (
      p_item_id, p_option_name, COALESCE(p_is_default, false), COALESCE(p_price_delta, 0), p_sort_order
    )
    RETURNING id INTO v_id;
  ELSE
    v_scope_error := public.event_commerce_assert_item_option_in_package(
      p_package_id, p_item_id, v_id
    );
    IF v_scope_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
    END IF;

    UPDATE public.package_item_options AS pio
    SET option_name = p_option_name,
        is_default = COALESCE(p_is_default, pio.is_default),
        price_delta = COALESCE(p_price_delta, pio.price_delta),
        sort_order = COALESCE(p_sort_order, pio.sort_order)
    WHERE pio.id = v_id AND pio.package_item_id = p_item_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'item_id', p_item_id,
    'option_id', v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_package_item_option_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_item_id uuid,
  p_option_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_delete_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_scope_error := public.event_commerce_assert_item_option_in_package(
    p_package_id, p_item_id, p_option_id
  );
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_delete_error := public.event_commerce_package_item_option_is_deletable(p_option_id);
  IF v_delete_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_delete_error);
  END IF;

  DELETE FROM public.package_item_options
  WHERE id = p_option_id AND package_item_id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'item_id', p_item_id,
    'option_id', p_option_id
  );
END;
$$;

-- ============================================================
-- §4 package_upgrades
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_package_upgrade_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_name text,
  p_upgrade_type text,
  p_price_delta numeric DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_max_quantity integer DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_upgrade_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_existing public.package_upgrades%ROWTYPE;
  v_id uuid := p_upgrade_id;
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

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_upgrade_type IS NULL OR p_upgrade_type NOT IN ('swap', 'addon', 'extra') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_UPGRADE_TYPE');
  END IF;

  IF p_price_delta IS NOT NULL AND p_price_delta < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  IF v_id IS NULL THEN
    IF p_max_quantity IS NOT NULL AND p_max_quantity <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
    END IF;

    INSERT INTO public.package_upgrades (
      package_id, name, upgrade_type, price_delta, description, max_quantity, sort_order
    )
    VALUES (
      p_package_id, p_name, p_upgrade_type, COALESCE(p_price_delta, 0),
      p_description, COALESCE(p_max_quantity, 1), p_sort_order
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.package_upgrades
    WHERE id = v_id;

    IF NOT FOUND OR v_existing.package_id <> p_package_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_UPGRADE_NOT_FOUND');
    END IF;

    IF p_max_quantity IS NOT NULL AND p_max_quantity <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
    END IF;

    UPDATE public.package_upgrades
    SET name = p_name,
        upgrade_type = p_upgrade_type,
        price_delta = COALESCE(p_price_delta, package_upgrades.price_delta),
        description = COALESCE(p_description, package_upgrades.description),
        max_quantity = COALESCE(p_max_quantity, package_upgrades.max_quantity),
        sort_order = COALESCE(p_sort_order, package_upgrades.sort_order)
    WHERE id = v_id AND package_id = p_package_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'upgrade_id', v_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_UPGRADE_TYPE');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_package_upgrade_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_upgrade_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_delete_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_scope_error := public.event_commerce_assert_upgrade_in_package(p_package_id, p_upgrade_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_delete_error := public.event_commerce_package_upgrade_is_deletable(p_upgrade_id);
  IF v_delete_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_delete_error);
  END IF;

  DELETE FROM public.package_upgrades
  WHERE id = p_upgrade_id AND package_id = p_package_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'upgrade_id', p_upgrade_id
  );
END;
$$;

-- ============================================================
-- §5 package_upgrade_options
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_package_upgrade_option_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_upgrade_id uuid,
  p_option_name text,
  p_price_delta numeric DEFAULT NULL,
  p_linked_package_item_id uuid DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_id uuid := p_option_id;
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

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_scope_error := public.event_commerce_assert_upgrade_in_package(p_package_id, p_upgrade_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  IF p_option_name IS NULL OR btrim(p_option_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_price_delta IS NOT NULL AND p_price_delta < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  v_scope_error := public.event_commerce_assert_linked_item_same_package(
    p_package_id, p_linked_package_item_id
  );
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.package_upgrade_options (
      upgrade_id, option_name, price_delta, linked_package_item_id, sort_order
    )
    VALUES (
      p_upgrade_id, p_option_name, COALESCE(p_price_delta, 0), p_linked_package_item_id, p_sort_order
    )
    RETURNING id INTO v_id;
  ELSE
    v_scope_error := public.event_commerce_assert_upgrade_option_in_package(
      p_package_id, p_upgrade_id, v_id
    );
    IF v_scope_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
    END IF;

    UPDATE public.package_upgrade_options AS puo
    SET option_name = p_option_name,
        price_delta = COALESCE(p_price_delta, puo.price_delta),
        linked_package_item_id = COALESCE(
          p_linked_package_item_id, puo.linked_package_item_id
        ),
        sort_order = COALESCE(p_sort_order, puo.sort_order)
    WHERE puo.id = v_id AND puo.upgrade_id = p_upgrade_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'upgrade_id', p_upgrade_id,
    'option_id', v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_package_upgrade_option_atomic(
  p_event_id uuid,
  p_package_id uuid,
  p_upgrade_id uuid,
  p_option_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_delete_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_scope_error := public.event_commerce_assert_package_in_event(p_event_id, p_package_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_scope_error := public.event_commerce_assert_upgrade_option_in_package(
    p_package_id, p_upgrade_id, p_option_id
  );
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  v_delete_error := public.event_commerce_package_upgrade_option_is_deletable(p_option_id);
  IF v_delete_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_delete_error);
  END IF;

  DELETE FROM public.package_upgrade_options
  WHERE id = p_option_id AND upgrade_id = p_upgrade_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'package_id', p_package_id,
    'upgrade_id', p_upgrade_id,
    'option_id', p_option_id
  );
END;
$$;

-- ============================================================
-- §6 event_sale_categories
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_event_sale_category_atomic(
  p_event_id uuid,
  p_category text,
  p_fulfillment_mode text,
  p_is_enabled boolean DEFAULT true,
  p_category_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_mapping_error text;
  v_id uuid := p_category_id;
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

  v_mapping_error := public.event_commerce_validate_sale_category_mapping(
    p_category, p_fulfillment_mode
  );
  IF v_mapping_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_mapping_error);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.event_sale_categories (
      event_id, category, fulfillment_mode, is_enabled
    )
    VALUES (p_event_id, p_category, p_fulfillment_mode, p_is_enabled)
    RETURNING id INTO v_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.event_sale_categories
      WHERE id = v_id AND event_id = p_event_id
    ) THEN
      IF EXISTS (SELECT 1 FROM public.event_sale_categories WHERE id = v_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CATEGORY_NOT_FOUND');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CATEGORY_NOT_FOUND');
    END IF;

    UPDATE public.event_sale_categories
    SET category = p_category,
        fulfillment_mode = p_fulfillment_mode,
        is_enabled = p_is_enabled
    WHERE id = v_id AND event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'category_id', v_id,
    'category', p_category,
    'fulfillment_mode', p_fulfillment_mode
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CATEGORY_CONFLICT');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CATEGORY_FULFILLMENT_MAPPING');
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_event_sale_category_atomic(
  p_event_id uuid,
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.event_sale_categories%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.event_sale_categories
  WHERE id = p_category_id FOR UPDATE;

  IF NOT FOUND OR v_row.event_id <> p_event_id THEN
    IF FOUND AND v_row.event_id <> p_event_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CATEGORY_NOT_FOUND');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'SALE_CATEGORY_NOT_FOUND');
  END IF;

  IF NOT v_row.is_enabled THEN
    RETURN jsonb_build_object('success', true, 'category_id', p_category_id, 'noop', true);
  END IF;

  UPDATE public.event_sale_categories
  SET is_enabled = false
  WHERE id = p_category_id AND event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'category_id', p_category_id
  );
END;
$$;

-- ============================================================
-- §7 REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.event_commerce_assert_package_in_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_item_in_package(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_item_option_in_package(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_upgrade_in_package(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_upgrade_option_in_package(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_assert_linked_item_same_package(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_validate_sale_category_mapping(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_package_item_is_deletable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_package_item_option_is_deletable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_package_upgrade_is_deletable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_commerce_package_upgrade_option_is_deletable(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_package_item_atomic(
  uuid, uuid, text, text, integer, text, boolean, boolean, integer, integer, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_package_item_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_package_item_option_atomic(
  uuid, uuid, uuid, text, boolean, numeric, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_package_item_option_atomic(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_package_upgrade_atomic(
  uuid, uuid, text, text, numeric, text, integer, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_package_upgrade_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_package_upgrade_option_atomic(
  uuid, uuid, uuid, text, numeric, uuid, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_package_upgrade_option_atomic(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_sale_category_atomic(
  uuid, text, text, boolean, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_event_sale_category_atomic(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_package_item_atomic(
  uuid, uuid, text, text, integer, text, boolean, boolean, integer, integer, integer, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_item_atomic(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_package_item_option_atomic(
  uuid, uuid, uuid, text, boolean, numeric, integer, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_item_option_atomic(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_package_upgrade_atomic(
  uuid, uuid, text, text, numeric, text, integer, integer, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_upgrade_atomic(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_package_upgrade_option_atomic(
  uuid, uuid, uuid, text, numeric, uuid, integer, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_upgrade_option_atomic(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_sale_category_atomic(
  uuid, text, text, boolean, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_event_sale_category_atomic(uuid, uuid) TO authenticated;

COMMIT;
