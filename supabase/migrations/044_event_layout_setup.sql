-- Migration 044 — Event Layout Setup
-- Scope: event_tables management + event-specific layout overrides (delta on venue master).
-- Auth: can_manage_event (organizer / event staff). Venue master CRUD is NOT included.
-- Depends on: 011, 016, 034, 042, 043.
-- Does NOT modify: 001–043, reservation/check-in/admission RPCs, venue master geometry.

BEGIN;

-- ============================================================
-- §1 event_layout_overrides
-- Event-specific geometry / visibility delta on venue master resources.
-- NULL column = no override for that field (inherit master at render time).
-- ============================================================

CREATE TABLE public.event_layout_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL
    REFERENCES public.events (id),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,

  position_x numeric(10,3) NULL,
  position_y numeric(10,3) NULL,
  width numeric(10,3) NULL,
  depth numeric(10,3) NULL,
  height numeric(10,3) NULL,
  elevation numeric(10,3) NULL,
  rotation numeric(6,2) NULL,
  shape text NULL,
  is_visible boolean NULL,
  z_index integer NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_layout_overrides_event_resource_unique
    UNIQUE (event_id, resource_type, resource_id),

  CONSTRAINT event_layout_overrides_resource_type_check
    CHECK (resource_type IN ('table', 'seat', 'object')),

  CONSTRAINT event_layout_overrides_width_positive_check
    CHECK (width IS NULL OR width > 0),

  CONSTRAINT event_layout_overrides_depth_positive_check
    CHECK (depth IS NULL OR depth > 0),

  CONSTRAINT event_layout_overrides_height_nonnegative_check
    CHECK (height IS NULL OR height >= 0),

  CONSTRAINT event_layout_overrides_elevation_nonnegative_check
    CHECK (elevation IS NULL OR elevation >= 0),

  CONSTRAINT event_layout_overrides_rotation_check
    CHECK (rotation IS NULL OR (rotation >= 0 AND rotation < 360)),

  CONSTRAINT event_layout_overrides_shape_check
    CHECK (
      shape IS NULL
      OR shape IN ('round', 'square', 'rectangle', 'oval', 'line', 'other')
    )
);

CREATE INDEX event_layout_overrides_event_id_idx
  ON public.event_layout_overrides (event_id);

CREATE INDEX event_layout_overrides_event_resource_type_idx
  ON public.event_layout_overrides (event_id, resource_type);

-- ============================================================
-- §2 RLS — SELECT only; mutation via SECURITY DEFINER RPCs
-- ============================================================

ALTER TABLE public.event_layout_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_layout_overrides_select_public
  ON public.event_layout_overrides;

CREATE POLICY event_layout_overrides_select_public
  ON public.event_layout_overrides
  FOR SELECT
  TO anon, authenticated
  USING (
    public.event_is_published(event_id)
    OR public.can_manage_event(event_id)
  );

GRANT SELECT ON public.event_layout_overrides TO anon, authenticated;

-- ============================================================
-- §3 Internal helpers (not granted to authenticated)
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_layout_raise_if_rpc_failed(p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_result IS NULL OR COALESCE((p_result->>'success')::boolean, false) = false THEN
    RAISE EXCEPTION 'EVENT_LAYOUT_RPC_FAILED:%', COALESCE(p_result->>'error_code', 'UNKNOWN')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_layout_assert_resource_in_event_venue(
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

  IF p_resource_type = 'table' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.venue_tables AS vt
      WHERE vt.id = p_resource_id
        AND vt.venue_id = v_event_venue_id
    ) THEN
      IF EXISTS (SELECT 1 FROM public.venue_tables WHERE id = p_resource_id) THEN
        RETURN 'RESOURCE_NOT_IN_EVENT_VENUE';
      END IF;
      RETURN 'RESOURCE_NOT_FOUND';
    END IF;
    RETURN NULL;
  END IF;

  IF p_resource_type = 'seat' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.venue_seats AS vs
      WHERE vs.id = p_resource_id
        AND vs.venue_id = v_event_venue_id
    ) THEN
      IF EXISTS (SELECT 1 FROM public.venue_seats WHERE id = p_resource_id) THEN
        RETURN 'RESOURCE_NOT_IN_EVENT_VENUE';
      END IF;
      RETURN 'RESOURCE_NOT_FOUND';
    END IF;
    RETURN NULL;
  END IF;

  IF p_resource_type = 'object' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.venue_layout_objects AS vlo
      WHERE vlo.id = p_resource_id
        AND vlo.venue_id = v_event_venue_id
    ) THEN
      IF EXISTS (SELECT 1 FROM public.venue_layout_objects WHERE id = p_resource_id) THEN
        RETURN 'RESOURCE_NOT_IN_EVENT_VENUE';
      END IF;
      RETURN 'RESOURCE_NOT_FOUND';
    END IF;
    RETURN NULL;
  END IF;

  RETURN 'INVALID_RESOURCE_TYPE';
END;
$$;

CREATE OR REPLACE FUNCTION public.event_layout_event_table_is_removable(p_event_table_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.event_tables%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.event_tables
  WHERE id = p_event_table_id;

  IF NOT FOUND THEN
    RETURN 'EVENT_TABLE_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.table_packages AS tp
    WHERE tp.event_table_id = p_event_table_id
  ) THEN
    RETURN 'EVENT_TABLE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.table_reservations AS tr
    WHERE tr.event_table_id = p_event_table_id
  ) THEN
    RETURN 'EVENT_TABLE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.event_resource_blocks AS erb
    WHERE erb.event_id = v_row.event_id
      AND erb.resource_type = 'table'
      AND erb.resource_id = v_row.table_id
      AND erb.is_active
  ) THEN
    RETURN 'EVENT_TABLE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.resource_locks AS rl
    WHERE rl.event_id = v_row.event_id
      AND rl.resource_type = 'table'
      AND rl.resource_id = v_row.table_id
      AND rl.status = 'active'
  ) THEN
    RETURN 'EVENT_TABLE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entry_passes AS ep
    JOIN public.table_reservations AS tr
      ON tr.id = ep.parent_id
     AND ep.parent_type = 'table_reservation'
    WHERE tr.event_table_id = p_event_table_id
  ) THEN
    RETURN 'EVENT_TABLE_IN_USE';
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. upsert_event_table_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_event_table_atomic(
  p_event_id uuid,
  p_table_id uuid,
  p_is_sellable boolean DEFAULT true,
  p_max_guests integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_table_id uuid;
  v_venue_capacity integer;
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

  SELECT vt.capacity
  INTO v_venue_capacity
  FROM public.events AS e
  JOIN public.venue_tables AS vt
    ON vt.id = p_table_id
   AND vt.venue_id = e.venue_id
  WHERE e.id = p_event_id;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.venue_tables WHERE id = p_table_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_VENUE_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_NOT_FOUND');
  END IF;

  IF p_max_guests IS NOT NULL AND p_max_guests > v_venue_capacity THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_MAX_GUESTS');
  END IF;

  INSERT INTO public.event_tables (
    event_id, table_id, is_sellable, max_guests
  )
  VALUES (
    p_event_id, p_table_id, p_is_sellable, p_max_guests
  )
  ON CONFLICT (event_id, table_id) DO UPDATE
    SET is_sellable = EXCLUDED.is_sellable,
        max_guests = EXCLUDED.max_guests
  RETURNING id INTO v_event_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'event_table_id', v_event_table_id,
    'table_id', p_table_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_ALREADY_EXISTS');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_MAX_GUESTS');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. remove_event_table_atomic
-- Hard DELETE only when dependency-free. Never touches venue master tables.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_event_table_atomic(
  p_event_id uuid,
  p_event_table_id uuid DEFAULT NULL,
  p_table_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_table_id uuid := p_event_table_id;
  v_removable_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_event_table_id IS NULL THEN
    IF p_table_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_NOT_FOUND');
    END IF;

    SELECT et.id
    INTO v_event_table_id
    FROM public.event_tables AS et
    WHERE et.event_id = p_event_id
      AND et.table_id = p_table_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_NOT_FOUND');
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.event_tables AS et
      WHERE et.id = v_event_table_id
        AND et.event_id = p_event_id
    ) THEN
      IF EXISTS (SELECT 1 FROM public.event_tables WHERE id = v_event_table_id) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_EVENT_MISMATCH');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_TABLE_NOT_FOUND');
    END IF;
  END IF;

  v_removable_error := public.event_layout_event_table_is_removable(v_event_table_id);
  IF v_removable_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_removable_error);
  END IF;

  DELETE FROM public.event_tables
  WHERE id = v_event_table_id
    AND event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'event_table_id', v_event_table_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. upsert_event_layout_override_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_event_layout_override_atomic(
  p_event_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_position_x numeric DEFAULT NULL,
  p_position_y numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_depth numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_elevation numeric DEFAULT NULL,
  p_rotation numeric DEFAULT NULL,
  p_shape text DEFAULT NULL,
  p_is_visible boolean DEFAULT NULL,
  p_z_index integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_resource_error text;
  v_override_id uuid;
  v_existing public.event_layout_overrides%ROWTYPE;
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

  IF p_resource_type NOT IN ('table', 'seat', 'object') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_RESOURCE_TYPE');
  END IF;

  v_resource_error := public.event_layout_assert_resource_in_event_venue(
    p_event_id,
    p_resource_type,
    p_resource_id
  );
  IF v_resource_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_resource_error);
  END IF;

  SELECT * INTO v_existing
  FROM public.event_layout_overrides
  WHERE event_id = p_event_id
    AND resource_type = p_resource_type
    AND resource_id = p_resource_id;

  IF NOT FOUND THEN
    INSERT INTO public.event_layout_overrides (
      event_id, resource_type, resource_id,
      position_x, position_y, width, depth, height, elevation,
      rotation, shape, is_visible, z_index
    )
    VALUES (
      p_event_id, p_resource_type, p_resource_id,
      p_position_x, p_position_y, p_width, p_depth, p_height, p_elevation,
      p_rotation, p_shape, p_is_visible, p_z_index
    )
    RETURNING id INTO v_override_id;
  ELSE
    UPDATE public.event_layout_overrides
    SET position_x = COALESCE(p_position_x, v_existing.position_x),
        position_y = COALESCE(p_position_y, v_existing.position_y),
        width = COALESCE(p_width, v_existing.width),
        depth = COALESCE(p_depth, v_existing.depth),
        height = COALESCE(p_height, v_existing.height),
        elevation = COALESCE(p_elevation, v_existing.elevation),
        rotation = COALESCE(p_rotation, v_existing.rotation),
        shape = COALESCE(p_shape, v_existing.shape),
        is_visible = COALESCE(p_is_visible, v_existing.is_visible),
        z_index = COALESCE(p_z_index, v_existing.z_index),
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_override_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'override_id', v_override_id,
    'resource_type', p_resource_type,
    'resource_id', p_resource_id
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_GEOMETRY');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONSTRAINT_VIOLATION');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. delete_event_layout_override_atomic
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_event_layout_override_atomic(
  p_event_id uuid,
  p_resource_type text,
  p_resource_id uuid
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

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_resource_type NOT IN ('table', 'seat', 'object') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_RESOURCE_TYPE');
  END IF;

  DELETE FROM public.event_layout_overrides
  WHERE event_id = p_event_id
    AND resource_type = p_resource_type
    AND resource_id = p_resource_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'OVERRIDE_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'resource_type', p_resource_type,
    'resource_id', p_resource_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. save_event_layout_batch_atomic
-- Changed-records only. Max 200 items total. Post-DML failures abort transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_event_layout_batch_atomic(
  p_event_id uuid,
  p_tables jsonb DEFAULT '[]'::jsonb,
  p_overrides jsonb DEFAULT '[]'::jsonb
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
  v_table_id uuid;
  v_resource_type text;
  v_resource_id uuid;
  v_resource_error text;
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

  v_total :=
    jsonb_array_length(COALESCE(p_tables, '[]'::jsonb))
    + jsonb_array_length(COALESCE(p_overrides, '[]'::jsonb));

  IF v_total > 200 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'BATCH_LIMIT_EXCEEDED');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_tables, '[]'::jsonb))
  LOOP
    v_table_id := NULLIF(v_item->>'table_id', '')::uuid;

    IF v_table_id IS NULL THEN
      RAISE EXCEPTION 'EVENT_LAYOUT_RPC_FAILED:%', 'TABLE_NOT_FOUND'
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.event_tables AS et
      WHERE et.event_id = p_event_id
        AND et.table_id = v_table_id
    ) THEN
      UPDATE public.event_tables
      SET is_sellable = CASE
            WHEN v_item ? 'is_sellable' THEN (v_item->>'is_sellable')::boolean
            ELSE is_sellable
          END,
          max_guests = CASE
            WHEN v_item ? 'max_guests' THEN NULLIF(v_item->>'max_guests', '')::integer
            ELSE max_guests
          END
      WHERE event_id = p_event_id
        AND table_id = v_table_id;
    ELSE
      v_result := public.upsert_event_table_atomic(
        p_event_id,
        v_table_id,
        CASE
          WHEN v_item ? 'is_sellable' THEN (v_item->>'is_sellable')::boolean
          ELSE true
        END,
        CASE
          WHEN v_item ? 'max_guests' THEN NULLIF(v_item->>'max_guests', '')::integer
          ELSE NULL
        END
      );
      PERFORM public.event_layout_raise_if_rpc_failed(v_result);
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_overrides, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'delete')::boolean, false) THEN
      v_resource_type := NULLIF(v_item->>'resource_type', '');
      v_resource_id := NULLIF(v_item->>'resource_id', '')::uuid;

      IF v_resource_type IS NULL OR v_resource_id IS NULL THEN
        RAISE EXCEPTION 'EVENT_LAYOUT_RPC_FAILED:%', 'OVERRIDE_NOT_FOUND'
          USING ERRCODE = 'P0001';
      END IF;

      v_result := public.delete_event_layout_override_atomic(
        p_event_id,
        v_resource_type,
        v_resource_id
      );
      PERFORM public.event_layout_raise_if_rpc_failed(v_result);
    ELSE
      v_resource_type := NULLIF(v_item->>'resource_type', '');
      v_resource_id := NULLIF(v_item->>'resource_id', '')::uuid;

      IF v_resource_type IS NULL OR v_resource_id IS NULL THEN
        RAISE EXCEPTION 'EVENT_LAYOUT_RPC_FAILED:%', 'INVALID_RESOURCE_TYPE'
          USING ERRCODE = 'P0001';
      END IF;

      v_resource_error := public.event_layout_assert_resource_in_event_venue(
        p_event_id,
        v_resource_type,
        v_resource_id
      );
      IF v_resource_error IS NOT NULL THEN
        RAISE EXCEPTION 'EVENT_LAYOUT_RPC_FAILED:%', v_resource_error
          USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.event_layout_overrides (
        event_id, resource_type, resource_id,
        position_x, position_y, width, depth, height, elevation,
        rotation, shape, is_visible, z_index
      )
      VALUES (
        p_event_id,
        v_resource_type,
        v_resource_id,
        NULLIF(v_item->>'position_x', '')::numeric,
        NULLIF(v_item->>'position_y', '')::numeric,
        NULLIF(v_item->>'width', '')::numeric,
        NULLIF(v_item->>'depth', '')::numeric,
        NULLIF(v_item->>'height', '')::numeric,
        NULLIF(v_item->>'elevation', '')::numeric,
        NULLIF(v_item->>'rotation', '')::numeric,
        NULLIF(v_item->>'shape', ''),
        CASE
          WHEN v_item ? 'is_visible' THEN (v_item->>'is_visible')::boolean
          ELSE NULL
        END,
        NULLIF(v_item->>'z_index', '')::integer
      )
      ON CONFLICT (event_id, resource_type, resource_id) DO UPDATE
        SET position_x = CASE
              WHEN v_item ? 'position_x' THEN NULLIF(v_item->>'position_x', '')::numeric
              ELSE event_layout_overrides.position_x
            END,
            position_y = CASE
              WHEN v_item ? 'position_y' THEN NULLIF(v_item->>'position_y', '')::numeric
              ELSE event_layout_overrides.position_y
            END,
            width = CASE
              WHEN v_item ? 'width' THEN NULLIF(v_item->>'width', '')::numeric
              ELSE event_layout_overrides.width
            END,
            depth = CASE
              WHEN v_item ? 'depth' THEN NULLIF(v_item->>'depth', '')::numeric
              ELSE event_layout_overrides.depth
            END,
            height = CASE
              WHEN v_item ? 'height' THEN NULLIF(v_item->>'height', '')::numeric
              ELSE event_layout_overrides.height
            END,
            elevation = CASE
              WHEN v_item ? 'elevation' THEN NULLIF(v_item->>'elevation', '')::numeric
              ELSE event_layout_overrides.elevation
            END,
            rotation = CASE
              WHEN v_item ? 'rotation' THEN NULLIF(v_item->>'rotation', '')::numeric
              ELSE event_layout_overrides.rotation
            END,
            shape = CASE
              WHEN v_item ? 'shape' THEN NULLIF(v_item->>'shape', '')
              ELSE event_layout_overrides.shape
            END,
            is_visible = CASE
              WHEN v_item ? 'is_visible' THEN (v_item->>'is_visible')::boolean
              ELSE event_layout_overrides.is_visible
            END,
            z_index = CASE
              WHEN v_item ? 'z_index' THEN NULLIF(v_item->>'z_index', '')::integer
              ELSE event_layout_overrides.z_index
            END,
            updated_at = now();
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
-- §4 REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.event_layout_raise_if_rpc_failed(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_layout_assert_resource_in_event_venue(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_layout_event_table_is_removable(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_event_table_atomic(uuid, uuid, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_event_table_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_layout_override_atomic(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_event_layout_override_atomic(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_event_layout_batch_atomic(uuid, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_event_table_atomic(uuid, uuid, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_table_atomic(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_layout_override_atomic(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_layout_override_atomic(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_layout_batch_atomic(uuid, jsonb, jsonb) TO authenticated;

COMMIT;
