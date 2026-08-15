-- Migration 043 — Venue Master Layout CRUD RPCs
-- Scope: SECURITY DEFINER mutation RPCs for venue owner / super admin only.
-- No schema changes, no RLS mutation policies, no event/reservation/check-in logic.
-- Depends on: 008, 009, 034, 042.

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted to authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.venue_layout_is_table_in_use(p_table_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.event_tables WHERE table_id = p_table_id)
      OR EXISTS (SELECT 1 FROM public.table_reservations WHERE table_id = p_table_id)
      OR EXISTS (
        SELECT 1
        FROM public.event_resource_blocks
        WHERE resource_type = 'table'
          AND resource_id = p_table_id
          AND is_active
      )
      OR EXISTS (
        SELECT 1
        FROM public.resource_locks
        WHERE resource_type = 'table'
          AND resource_id = p_table_id
          AND status = 'active'
      );
$$;

CREATE OR REPLACE FUNCTION public.venue_layout_is_seat_in_use(p_seat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.event_seat_pricing WHERE seat_id = p_seat_id)
      OR EXISTS (SELECT 1 FROM public.seat_reservations WHERE seat_id = p_seat_id)
      OR EXISTS (
        SELECT 1
        FROM public.event_resource_blocks
        WHERE resource_type = 'seat'
          AND resource_id = p_seat_id
          AND is_active
      )
      OR EXISTS (
        SELECT 1
        FROM public.resource_locks
        WHERE resource_type = 'seat'
          AND resource_id = p_seat_id
          AND status = 'active'
      );
$$;

CREATE OR REPLACE FUNCTION public.venue_layout_assert_area_belongs_to_venue(
  p_venue_id uuid,
  p_area_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.venue_areas AS a
      WHERE a.id = p_area_id
        AND a.venue_id = p_venue_id
    ) THEN 'AREA_VENUE_MISMATCH'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.venue_layout_raise_if_rpc_failed(p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_result IS NULL OR COALESCE((p_result->>'success')::boolean, false) = false THEN
    RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', COALESCE(p_result->>'error_code', 'UNKNOWN')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. update_venue_layout_canvas_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_venue_layout_canvas_atomic(
  p_venue_id uuid,
  p_canvas_width numeric DEFAULT NULL,
  p_canvas_height numeric DEFAULT NULL,
  p_grid_size numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  UPDATE public.venues
  SET layout_canvas_width = COALESCE(p_canvas_width, layout_canvas_width),
      layout_canvas_height = COALESCE(p_canvas_height, layout_canvas_height),
      layout_grid_size = COALESCE(p_grid_size, layout_grid_size),
      updated_at = now()
  WHERE id = p_venue_id;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'layout_canvas_width', p_canvas_width,
    'layout_canvas_height', p_canvas_height,
    'layout_grid_size', p_grid_size
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. upsert_venue_area_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_venue_area_atomic(
  p_venue_id uuid,
  p_name text,
  p_area_type text,
  p_capacity integer,
  p_sort_order integer DEFAULT 0,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_area_id uuid := p_area_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF p_area_id IS NULL THEN
    v_area_id := gen_random_uuid();

    INSERT INTO public.venue_areas (
      id, venue_id, name, area_type, capacity, sort_order,
      position_x, position_y, width, height, rotation, shape
    )
    VALUES (
      v_area_id, p_venue_id, p_name, p_area_type, p_capacity, p_sort_order,
      p_position_x, p_position_y, p_width, p_height, p_rotation, p_shape
    );
  ELSE
    UPDATE public.venue_areas
    SET name = p_name,
        area_type = p_area_type,
        capacity = p_capacity,
        sort_order = p_sort_order,
        position_x = p_position_x,
        position_y = p_position_y,
        width = p_width,
        height = p_height,
        rotation = p_rotation,
        shape = p_shape
    WHERE id = p_area_id
      AND venue_id = p_venue_id;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.venue_areas WHERE id = p_area_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'AREA_VENUE_MISMATCH');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'AREA_NOT_FOUND');
    END IF;

    v_area_id := p_area_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'area_id', v_area_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. upsert_venue_table_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_venue_table_atomic(
  p_venue_id uuid,
  p_table_number text,
  p_capacity integer,
  p_table_type text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_elevation numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_table_id uuid := p_table_id;
  v_existing public.venue_tables%ROWTYPE;
  v_area_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_area_error := public.venue_layout_assert_area_belongs_to_venue(p_venue_id, p_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF p_table_id IS NULL THEN
    INSERT INTO public.venue_tables (
      venue_id, area_id, table_number, capacity, table_type,
      position_x, position_y, width, depth, height, elevation, rotation, shape
    )
    VALUES (
      p_venue_id, p_area_id, p_table_number, p_capacity, p_table_type,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_elevation,
      p_rotation, p_shape
    )
    RETURNING id INTO v_table_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.venue_tables
    WHERE id = p_table_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_NOT_FOUND');
    END IF;

    IF v_existing.venue_id IS DISTINCT FROM p_venue_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_VENUE_MISMATCH');
    END IF;

    IF public.venue_layout_is_table_in_use(p_table_id) THEN
      IF p_table_number IS DISTINCT FROM v_existing.table_number
          OR p_capacity IS DISTINCT FROM v_existing.capacity
          OR p_table_type IS DISTINCT FROM v_existing.table_type THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_IN_USE');
      END IF;
    END IF;

    UPDATE public.venue_tables
    SET area_id = p_area_id,
        table_number = p_table_number,
        capacity = p_capacity,
        table_type = p_table_type,
        position_x = COALESCE(p_position_x, v_existing.position_x),
        position_y = COALESCE(p_position_y, v_existing.position_y),
        width = COALESCE(p_width, v_existing.width),
        depth = COALESCE(p_depth, v_existing.depth),
        height = COALESCE(p_height, v_existing.height),
        elevation = COALESCE(p_elevation, v_existing.elevation),
        rotation = COALESCE(p_rotation, v_existing.rotation),
        shape = COALESCE(p_shape, v_existing.shape)
    WHERE id = p_table_id
      AND venue_id = p_venue_id;

    v_table_id := p_table_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'table_id', v_table_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. upsert_venue_seat_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_venue_seat_atomic(
  p_venue_id uuid,
  p_seat_number text,
  p_section text DEFAULT NULL,
  p_row_label text DEFAULT NULL,
  p_seat_type text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_seat_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_seat_id uuid := p_seat_id;
  v_existing public.venue_seats%ROWTYPE;
  v_area_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_area_error := public.venue_layout_assert_area_belongs_to_venue(p_venue_id, p_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF p_seat_id IS NULL THEN
    INSERT INTO public.venue_seats (
      venue_id, area_id, section, row_label, seat_number, seat_type,
      position_x, position_y, width, depth, height, rotation, shape
    )
    VALUES (
      p_venue_id, p_area_id, p_section, p_row_label, p_seat_number, p_seat_type,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_rotation, p_shape
    )
    RETURNING id INTO v_seat_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.venue_seats
    WHERE id = p_seat_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_NOT_FOUND');
    END IF;

    IF v_existing.venue_id IS DISTINCT FROM p_venue_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_VENUE_MISMATCH');
    END IF;

    IF public.venue_layout_is_seat_in_use(p_seat_id) THEN
      IF p_section IS DISTINCT FROM v_existing.section
          OR p_row_label IS DISTINCT FROM v_existing.row_label
          OR p_seat_number IS DISTINCT FROM v_existing.seat_number
          OR p_seat_type IS DISTINCT FROM v_existing.seat_type THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_IN_USE');
      END IF;
    END IF;

    UPDATE public.venue_seats
    SET area_id = p_area_id,
        section = p_section,
        row_label = p_row_label,
        seat_number = p_seat_number,
        seat_type = p_seat_type,
        position_x = COALESCE(p_position_x, v_existing.position_x),
        position_y = COALESCE(p_position_y, v_existing.position_y),
        width = COALESCE(p_width, v_existing.width),
        depth = COALESCE(p_depth, v_existing.depth),
        height = COALESCE(p_height, v_existing.height),
        rotation = COALESCE(p_rotation, v_existing.rotation),
        shape = COALESCE(p_shape, v_existing.shape)
    WHERE id = p_seat_id
      AND venue_id = p_venue_id;

    v_seat_id := p_seat_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'venue_id', p_venue_id, 'seat_id', v_seat_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. upsert_venue_layout_object_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_venue_layout_object_atomic(
  p_venue_id uuid,
  p_object_type text,
  p_name text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_elevation numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_z_index integer DEFAULT 0,
  p_is_visible boolean DEFAULT true,
  p_object_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_object_id uuid := p_object_id;
  v_area_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF p_area_id IS NOT NULL THEN
    v_area_error := public.venue_layout_assert_area_belongs_to_venue(p_venue_id, p_area_id);
    IF v_area_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_area_error);
    END IF;
  END IF;

  IF p_object_id IS NULL THEN
    INSERT INTO public.venue_layout_objects (
      venue_id, area_id, object_type, name,
      position_x, position_y, width, depth, height, elevation, rotation, shape,
      z_index, is_visible, created_by
    )
    VALUES (
      p_venue_id, p_area_id, p_object_type, p_name,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_elevation,
      p_rotation, p_shape, p_z_index, p_is_visible, v_user_id
    )
    RETURNING id INTO v_object_id;
  ELSE
    UPDATE public.venue_layout_objects
    SET area_id = p_area_id,
        object_type = p_object_type,
        name = p_name,
        position_x = p_position_x,
        position_y = p_position_y,
        width = p_width,
        depth = p_depth,
        height = p_height,
        elevation = p_elevation,
        rotation = p_rotation,
        shape = p_shape,
        z_index = p_z_index,
        is_visible = p_is_visible,
        updated_at = now()
    WHERE id = p_object_id
      AND venue_id = p_venue_id;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = p_object_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_VENUE_MISMATCH');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_NOT_FOUND');
    END IF;

    v_object_id := p_object_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'object_id', v_object_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. delete_venue_layout_object_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_venue_layout_object_atomic(
  p_venue_id uuid,
  p_object_id uuid,
  p_soft_only boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_layout_objects
    WHERE id = p_object_id
      AND venue_id = p_venue_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = p_object_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_VENUE_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'OBJECT_NOT_FOUND');
  END IF;

  IF p_soft_only THEN
    UPDATE public.venue_layout_objects
    SET is_visible = false,
        updated_at = now()
    WHERE id = p_object_id
      AND venue_id = p_venue_id;
  ELSE
    DELETE FROM public.venue_layout_objects
    WHERE id = p_object_id
      AND venue_id = p_venue_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'object_id', p_object_id,
    'soft_only', p_soft_only
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. save_venue_layout_batch_atomic
-- Changed-records only. No full snapshot replace. Max 200 items total.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_venue_layout_batch_atomic(
  p_venue_id uuid,
  p_canvas jsonb DEFAULT NULL,
  p_areas jsonb DEFAULT '[]'::jsonb,
  p_tables jsonb DEFAULT '[]'::jsonb,
  p_seats jsonb DEFAULT '[]'::jsonb,
  p_objects jsonb DEFAULT '[]'::jsonb
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
  v_area_id uuid;
  v_table_id uuid;
  v_seat_id uuid;
  v_object_id uuid;
  v_soft_only boolean;
  v_existing public.venue_tables%ROWTYPE;
  v_existing_seat public.venue_seats%ROWTYPE;
  v_area_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (public.owns_venue(p_venue_id) OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  v_total :=
    jsonb_array_length(COALESCE(p_areas, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_tables, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_seats, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_objects, '[]'::jsonb));

  IF v_total > 200 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'BATCH_LIMIT_EXCEEDED');
  END IF;

  IF p_canvas IS NOT NULL THEN
    v_result := public.update_venue_layout_canvas_atomic(
      p_venue_id,
      NULLIF(p_canvas->>'canvas_width', '')::numeric,
      NULLIF(p_canvas->>'canvas_height', '')::numeric,
      NULLIF(p_canvas->>'grid_size', '')::numeric
    );
    PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_areas, '[]'::jsonb))
  LOOP
    v_area_id := NULLIF(v_item->>'area_id', '')::uuid;

    IF v_area_id IS NULL THEN
      v_result := public.upsert_venue_area_atomic(
        p_venue_id,
        v_item->>'name',
        v_item->>'area_type',
        NULLIF(v_item->>'capacity', '')::integer,
        COALESCE(NULLIF(v_item->>'sort_order', '')::integer, 0),
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        NULL
      );
      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.venue_areas
        WHERE id = v_area_id
          AND venue_id = p_venue_id
      ) THEN
        IF EXISTS (SELECT 1 FROM public.venue_areas WHERE id = v_area_id) THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'AREA_VENUE_MISMATCH'
            USING ERRCODE = 'P0001';
        END IF;
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'AREA_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE public.venue_areas
      SET name = CASE
            WHEN v_item ? 'name' THEN v_item->>'name'
            ELSE name
          END,
          area_type = CASE
            WHEN v_item ? 'area_type' THEN NULLIF(v_item->>'area_type', '')
            ELSE area_type
          END,
          capacity = CASE
            WHEN v_item ? 'capacity' THEN NULLIF(v_item->>'capacity', '')::integer
            ELSE capacity
          END,
          sort_order = CASE
            WHEN v_item ? 'sort_order' THEN NULLIF(v_item->>'sort_order', '')::integer
            ELSE sort_order
          END,
          position_x = CASE
            WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
            ELSE position_x
          END,
          position_y = CASE
            WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
            ELSE position_y
          END,
          width = CASE
            WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
            ELSE width
          END,
          height = CASE
            WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
            ELSE height
          END,
          rotation = CASE
            WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
            ELSE rotation
          END,
          shape = CASE
            WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
            ELSE shape
          END
      WHERE id = v_area_id
        AND venue_id = p_venue_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_tables, '[]'::jsonb))
  LOOP
    v_table_id := NULLIF(v_item->>'table_id', '')::uuid;

    IF v_table_id IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.venue_tables
      WHERE id = v_table_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_existing.venue_id IS DISTINCT FROM p_venue_id THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_VENUE_MISMATCH'
          USING ERRCODE = 'P0001';
      END IF;

      IF NULLIF(v_item->>'area_id', '')::uuid IS NOT NULL THEN
        v_area_error := public.venue_layout_assert_area_belongs_to_venue(
          p_venue_id,
          NULLIF(v_item->>'area_id', '')::uuid
        );
        IF v_area_error IS NOT NULL THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', v_area_error
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF public.venue_layout_is_table_in_use(v_table_id) THEN
        IF (v_item ? 'table_number')
            AND v_item->>'table_number' IS DISTINCT FROM v_existing.table_number THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'capacity')
            AND NULLIF(v_item->>'capacity', '')::integer IS DISTINCT FROM v_existing.capacity THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'table_type')
            AND NULLIF(v_item->>'table_type', '') IS DISTINCT FROM v_existing.table_type THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'TABLE_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      UPDATE public.venue_tables
      SET area_id = CASE
            WHEN v_item ? 'area_id' THEN NULLIF(v_item->>'area_id', '')::uuid
            ELSE area_id
          END,
          table_number = COALESCE(v_item->>'table_number', table_number),
          capacity = COALESCE(NULLIF(v_item->>'capacity', '')::integer, capacity),
          table_type = CASE
            WHEN v_item ? 'table_type' THEN NULLIF(v_item->>'table_type', '')
            ELSE table_type
          END,
          position_x = CASE
            WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
            ELSE position_x
          END,
          position_y = CASE
            WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
            ELSE position_y
          END,
          width = CASE
            WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
            ELSE width
          END,
          depth = CASE
            WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
            ELSE depth
          END,
          height = CASE
            WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
            ELSE height
          END,
          elevation = CASE
            WHEN v_item ? 'elevation' THEN NULLIF(v_item->>'elevation', '')::numeric
            ELSE elevation
          END,
          rotation = CASE
            WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
            ELSE rotation
          END,
          shape = CASE
            WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
            ELSE shape
          END
      WHERE id = v_table_id
        AND venue_id = p_venue_id;
    ELSE
      v_result := public.upsert_venue_table_atomic(
        p_venue_id,
        v_item->>'table_number',
        NULLIF(v_item->>'capacity', '')::integer,
        NULLIF(v_item->>'table_type', ''),
        NULLIF(v_item->>'area_id', '')::uuid,
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'depth', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'elevation', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        NULL
      );

      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_seats, '[]'::jsonb))
  LOOP
    v_seat_id := NULLIF(v_item->>'seat_id', '')::uuid;

    IF v_seat_id IS NOT NULL THEN
      SELECT * INTO v_existing_seat
      FROM public.venue_seats
      WHERE id = v_seat_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_existing_seat.venue_id IS DISTINCT FROM p_venue_id THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_VENUE_MISMATCH'
          USING ERRCODE = 'P0001';
      END IF;

      IF NULLIF(v_item->>'area_id', '')::uuid IS NOT NULL THEN
        v_area_error := public.venue_layout_assert_area_belongs_to_venue(
          p_venue_id,
          NULLIF(v_item->>'area_id', '')::uuid
        );
        IF v_area_error IS NOT NULL THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', v_area_error
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF public.venue_layout_is_seat_in_use(v_seat_id) THEN
        IF (v_item ? 'section')
            AND NULLIF(v_item->>'section', '') IS DISTINCT FROM v_existing_seat.section THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'row_label')
            AND NULLIF(v_item->>'row_label', '') IS DISTINCT FROM v_existing_seat.row_label THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'seat_number')
            AND v_item->>'seat_number' IS DISTINCT FROM v_existing_seat.seat_number THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
        IF (v_item ? 'seat_type')
            AND NULLIF(v_item->>'seat_type', '') IS DISTINCT FROM v_existing_seat.seat_type THEN
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'SEAT_IN_USE'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      UPDATE public.venue_seats
      SET area_id = CASE
            WHEN v_item ? 'area_id' THEN NULLIF(v_item->>'area_id', '')::uuid
            ELSE area_id
          END,
          section = CASE
            WHEN v_item ? 'section' THEN NULLIF(v_item->>'section', '')
            ELSE section
          END,
          row_label = CASE
            WHEN v_item ? 'row_label' THEN NULLIF(v_item->>'row_label', '')
            ELSE row_label
          END,
          seat_number = COALESCE(v_item->>'seat_number', seat_number),
          seat_type = CASE
            WHEN v_item ? 'seat_type' THEN NULLIF(v_item->>'seat_type', '')
            ELSE seat_type
          END,
          position_x = CASE
            WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
            ELSE position_x
          END,
          position_y = CASE
            WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
            ELSE position_y
          END,
          width = CASE
            WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
            ELSE width
          END,
          depth = CASE
            WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
            ELSE depth
          END,
          height = CASE
            WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
            ELSE height
          END,
          rotation = CASE
            WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
            ELSE rotation
          END,
          shape = CASE
            WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
            ELSE shape
          END
      WHERE id = v_seat_id
        AND venue_id = p_venue_id;
    ELSE
      v_result := public.upsert_venue_seat_atomic(
        p_venue_id,
        v_item->>'seat_number',
        NULLIF(v_item->>'section', ''),
        NULLIF(v_item->>'row_label', ''),
        NULLIF(v_item->>'seat_type', ''),
        NULLIF(v_item->>'area_id', '')::uuid,
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'depth', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        NULL
      );

      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_objects, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'delete')::boolean, false) THEN
      v_object_id := NULLIF(v_item->>'object_id', '')::uuid;

      IF v_object_id IS NULL THEN
        RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'OBJECT_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      v_soft_only := COALESCE((v_item->>'soft_only')::boolean, true);

      v_result := public.delete_venue_layout_object_atomic(
        p_venue_id,
        v_object_id,
        v_soft_only
      );

      PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
    ELSE
      v_object_id := NULLIF(v_item->>'object_id', '')::uuid;

      IF v_object_id IS NULL THEN
        v_result := public.upsert_venue_layout_object_atomic(
          p_venue_id,
          v_item->>'object_type',
          NULLIF(v_item->>'name', ''),
          NULLIF(v_item->>'area_id', '')::uuid,
          NULLIF(v_item->>'position_x', '')::numeric,
          NULLIF(v_item->>'position_y', '')::numeric,
          NULLIF(v_item->>'width', '')::numeric,
          NULLIF(v_item->>'depth', '')::numeric,
          NULLIF(v_item->>'height', '')::numeric,
          NULLIF(v_item->>'elevation', '')::numeric,
          NULLIF(v_item->>'rotation', '')::numeric,
          NULLIF(v_item->>'shape', ''),
          COALESCE(NULLIF(v_item->>'z_index', '')::integer, 0),
          COALESCE((v_item->>'is_visible')::boolean, true),
          NULL
        );

        PERFORM public.venue_layout_raise_if_rpc_failed(v_result);
      ELSE
        IF NOT EXISTS (
          SELECT 1
          FROM public.venue_layout_objects
          WHERE id = v_object_id
            AND venue_id = p_venue_id
        ) THEN
          IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = v_object_id) THEN
            RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'OBJECT_VENUE_MISMATCH'
              USING ERRCODE = 'P0001';
          END IF;
          RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', 'OBJECT_NOT_FOUND'
            USING ERRCODE = 'P0001';
        END IF;

        IF (v_item ? 'area_id') AND NULLIF(v_item->>'area_id', '')::uuid IS NOT NULL THEN
          v_area_error := public.venue_layout_assert_area_belongs_to_venue(
            p_venue_id,
            NULLIF(v_item->>'area_id', '')::uuid
          );
          IF v_area_error IS NOT NULL THEN
            RAISE EXCEPTION 'VENUE_LAYOUT_RPC_FAILED:%', v_area_error
              USING ERRCODE = 'P0001';
          END IF;
        END IF;

        UPDATE public.venue_layout_objects
        SET area_id = CASE
              WHEN v_item ? 'area_id' THEN NULLIF(v_item->>'area_id', '')::uuid
              ELSE area_id
            END,
            object_type = CASE
              WHEN v_item ? 'object_type' THEN NULLIF(v_item->>'object_type', '')
              ELSE object_type
            END,
            name = CASE
              WHEN v_item ? 'name' THEN NULLIF(v_item->>'name', '')
              ELSE name
            END,
            position_x = CASE
              WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
              ELSE position_x
            END,
            position_y = CASE
              WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
              ELSE position_y
            END,
            width = CASE
              WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
              ELSE width
            END,
            depth = CASE
              WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
              ELSE depth
            END,
            height = CASE
              WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
              ELSE height
            END,
            elevation = CASE
              WHEN v_item ? 'elevation' THEN NULLIF(v_item->>'elevation', '')::numeric
              ELSE elevation
            END,
            rotation = CASE
              WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
              ELSE rotation
            END,
            shape = CASE
              WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
              ELSE shape
            END,
            z_index = CASE
              WHEN v_item ? 'z_index' THEN NULLIF(v_item->>'z_index', '')::integer
              ELSE z_index
            END,
            is_visible = CASE
              WHEN v_item ? 'is_visible' THEN (v_item->>'is_visible')::boolean
              ELSE is_visible
            END,
            updated_at = now()
        WHERE id = v_object_id
          AND venue_id = p_venue_id;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'venue_id', p_venue_id,
    'processed_count', v_total
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- REVOKE / GRANT
-- Internal helpers: revoke PUBLIC only (not granted to authenticated).
-- Public RPCs: revoke PUBLIC, grant authenticated.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.venue_layout_is_table_in_use(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_layout_is_seat_in_use(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_layout_assert_area_belongs_to_venue(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_layout_raise_if_rpc_failed(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_venue_layout_canvas_atomic(uuid, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_venue_area_atomic(
  uuid, text, text, integer, integer, numeric, numeric, numeric, numeric, numeric, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_venue_table_atomic(
  uuid, text, integer, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_venue_seat_atomic(
  uuid, text, text, text, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_venue_layout_object_atomic(
  uuid, text, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, boolean, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_venue_layout_object_atomic(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_venue_layout_batch_atomic(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_venue_layout_canvas_atomic(uuid, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_venue_area_atomic(
  uuid, text, text, integer, integer, numeric, numeric, numeric, numeric, numeric, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_venue_table_atomic(
  uuid, text, integer, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_venue_seat_atomic(
  uuid, text, text, text, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_venue_layout_object_atomic(
  uuid, text, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, boolean, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_venue_layout_object_atomic(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_venue_layout_batch_atomic(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated;
