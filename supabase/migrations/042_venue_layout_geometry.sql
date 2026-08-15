-- 042_venue_layout_geometry.sql
-- Venue Master Geometry only.
-- No event layout, reservation/check-in logic, RPC/CRUD, backfill, or data updates.
-- Apply/commit/push intentionally excluded from this step.

BEGIN;

-- ============================================================
-- §1 VENUES — canvas metadata
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS layout_canvas_width numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS layout_canvas_height numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS layout_grid_size numeric(10,3) NULL DEFAULT 1;

ALTER TABLE public.venues
  DROP CONSTRAINT IF EXISTS venues_layout_canvas_width_positive_check;

ALTER TABLE public.venues
  ADD CONSTRAINT venues_layout_canvas_width_positive_check
  CHECK (layout_canvas_width IS NULL OR layout_canvas_width > 0);

ALTER TABLE public.venues
  DROP CONSTRAINT IF EXISTS venues_layout_canvas_height_positive_check;

ALTER TABLE public.venues
  ADD CONSTRAINT venues_layout_canvas_height_positive_check
  CHECK (layout_canvas_height IS NULL OR layout_canvas_height > 0);

ALTER TABLE public.venues
  DROP CONSTRAINT IF EXISTS venues_layout_grid_size_positive_check;

ALTER TABLE public.venues
  ADD CONSTRAINT venues_layout_grid_size_positive_check
  CHECK (layout_grid_size IS NULL OR layout_grid_size > 0);

-- ============================================================
-- §2 VENUE AREAS — master geometry
-- Existing position_x / position_y are preserved.
-- ============================================================

ALTER TABLE public.venue_areas
  ADD COLUMN IF NOT EXISTS position_x numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS position_y numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS width numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS height numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS rotation numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS shape text NULL;

ALTER TABLE public.venue_areas
  DROP CONSTRAINT IF EXISTS venue_areas_layout_width_positive_check;

ALTER TABLE public.venue_areas
  ADD CONSTRAINT venue_areas_layout_width_positive_check
  CHECK (width IS NULL OR width > 0);

ALTER TABLE public.venue_areas
  DROP CONSTRAINT IF EXISTS venue_areas_layout_height_positive_check;

ALTER TABLE public.venue_areas
  ADD CONSTRAINT venue_areas_layout_height_positive_check
  CHECK (height IS NULL OR height > 0);

ALTER TABLE public.venue_areas
  DROP CONSTRAINT IF EXISTS venue_areas_layout_rotation_check;

ALTER TABLE public.venue_areas
  ADD CONSTRAINT venue_areas_layout_rotation_check
  CHECK (rotation IS NULL OR (rotation >= 0 AND rotation < 360));

ALTER TABLE public.venue_areas
  DROP CONSTRAINT IF EXISTS venue_areas_layout_shape_check;

ALTER TABLE public.venue_areas
  ADD CONSTRAINT venue_areas_layout_shape_check
  CHECK (shape IS NULL OR shape IN ('rectangle', 'oval'));

-- ============================================================
-- §3 VENUE TABLES — master geometry
-- Existing position_x / position_y are preserved.
-- ============================================================

ALTER TABLE public.venue_tables
  ADD COLUMN IF NOT EXISTS width numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS depth numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS height numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS elevation numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS rotation numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS shape text NULL;

ALTER TABLE public.venue_tables
  DROP CONSTRAINT IF EXISTS venue_tables_layout_width_positive_check;

ALTER TABLE public.venue_tables
  ADD CONSTRAINT venue_tables_layout_width_positive_check
  CHECK (width IS NULL OR width > 0);

ALTER TABLE public.venue_tables
  DROP CONSTRAINT IF EXISTS venue_tables_layout_depth_positive_check;

ALTER TABLE public.venue_tables
  ADD CONSTRAINT venue_tables_layout_depth_positive_check
  CHECK (depth IS NULL OR depth > 0);

ALTER TABLE public.venue_tables
  DROP CONSTRAINT IF EXISTS venue_tables_layout_height_nonnegative_check;

ALTER TABLE public.venue_tables
  ADD CONSTRAINT venue_tables_layout_height_nonnegative_check
  CHECK (height IS NULL OR height >= 0);

ALTER TABLE public.venue_tables
  DROP CONSTRAINT IF EXISTS venue_tables_layout_elevation_nonnegative_check;

ALTER TABLE public.venue_tables
  ADD CONSTRAINT venue_tables_layout_elevation_nonnegative_check
  CHECK (elevation IS NULL OR elevation >= 0);

ALTER TABLE public.venue_tables
  DROP CONSTRAINT IF EXISTS venue_tables_layout_rotation_check;

ALTER TABLE public.venue_tables
  ADD CONSTRAINT venue_tables_layout_rotation_check
  CHECK (rotation IS NULL OR (rotation >= 0 AND rotation < 360));

ALTER TABLE public.venue_tables
  DROP CONSTRAINT IF EXISTS venue_tables_layout_shape_check;

ALTER TABLE public.venue_tables
  ADD CONSTRAINT venue_tables_layout_shape_check
  CHECK (
    shape IS NULL
    OR shape IN ('round', 'square', 'rectangle', 'oval')
  );

-- ============================================================
-- §4 VENUE SEATS — master geometry
-- Existing position_x / position_y are preserved.
-- ============================================================

ALTER TABLE public.venue_seats
  ADD COLUMN IF NOT EXISTS width numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS depth numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS height numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS rotation numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS shape text NULL;

ALTER TABLE public.venue_seats
  DROP CONSTRAINT IF EXISTS venue_seats_layout_width_positive_check;

ALTER TABLE public.venue_seats
  ADD CONSTRAINT venue_seats_layout_width_positive_check
  CHECK (width IS NULL OR width > 0);

ALTER TABLE public.venue_seats
  DROP CONSTRAINT IF EXISTS venue_seats_layout_depth_positive_check;

ALTER TABLE public.venue_seats
  ADD CONSTRAINT venue_seats_layout_depth_positive_check
  CHECK (depth IS NULL OR depth > 0);

ALTER TABLE public.venue_seats
  DROP CONSTRAINT IF EXISTS venue_seats_layout_height_nonnegative_check;

ALTER TABLE public.venue_seats
  ADD CONSTRAINT venue_seats_layout_height_nonnegative_check
  CHECK (height IS NULL OR height >= 0);

ALTER TABLE public.venue_seats
  DROP CONSTRAINT IF EXISTS venue_seats_layout_rotation_check;

ALTER TABLE public.venue_seats
  ADD CONSTRAINT venue_seats_layout_rotation_check
  CHECK (rotation IS NULL OR (rotation >= 0 AND rotation < 360));

ALTER TABLE public.venue_seats
  DROP CONSTRAINT IF EXISTS venue_seats_layout_shape_check;

ALTER TABLE public.venue_seats
  ADD CONSTRAINT venue_seats_layout_shape_check
  CHECK (
    shape IS NULL
    OR shape IN ('round', 'square', 'rectangle', 'oval')
  );

-- ============================================================
-- §5 VENUE LAYOUT OBJECTS — structural/decorative master objects
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venue_layout_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL
    REFERENCES public.venues (id) ON DELETE CASCADE,
  area_id uuid NULL
    REFERENCES public.venue_areas (id) ON DELETE SET NULL,

  object_type text NOT NULL
    CHECK (
      object_type IN (
        'wall',
        'stage',
        'bar',
        'door',
        'entrance',
        'dance_floor',
        'vip_area',
        'pillar',
        'stairs',
        'other'
      )
    ),

  name text NULL,

  position_x numeric(10,3) NULL,
  position_y numeric(10,3) NULL,

  width numeric(10,3) NULL,
  depth numeric(10,3) NULL,
  height numeric(10,3) NULL,
  elevation numeric(10,3) NULL,
  rotation numeric(6,2) NULL,

  shape text NULL
    CHECK (
      shape IS NULL
      OR shape IN (
        'rectangle',
        'line',
        'round',
        'square',
        'oval',
        'other'
      )
    ),

  z_index integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,

  created_by uuid NULL
    REFERENCES public.profiles (id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT venue_layout_objects_width_positive_check
    CHECK (width IS NULL OR width > 0),

  CONSTRAINT venue_layout_objects_depth_positive_check
    CHECK (depth IS NULL OR depth > 0),

  CONSTRAINT venue_layout_objects_height_nonnegative_check
    CHECK (height IS NULL OR height >= 0),

  CONSTRAINT venue_layout_objects_elevation_nonnegative_check
    CHECK (elevation IS NULL OR elevation >= 0),

  CONSTRAINT venue_layout_objects_rotation_check
    CHECK (rotation IS NULL OR (rotation >= 0 AND rotation < 360))
);

-- ============================================================
-- §6 INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS venue_tables_venue_area_layout_idx
  ON public.venue_tables (venue_id, area_id);

CREATE INDEX IF NOT EXISTS venue_seats_venue_area_layout_idx
  ON public.venue_seats (venue_id, area_id);

CREATE INDEX IF NOT EXISTS venue_layout_objects_venue_idx
  ON public.venue_layout_objects (venue_id);

CREATE INDEX IF NOT EXISTS venue_layout_objects_venue_area_idx
  ON public.venue_layout_objects (venue_id, area_id);

CREATE INDEX IF NOT EXISTS venue_layout_objects_venue_object_type_idx
  ON public.venue_layout_objects (venue_id, object_type);

-- ============================================================
-- §7 RLS — new table only
-- No mutation policies. CRUD is reserved for 043 SECURITY DEFINER RPCs.
-- ============================================================

ALTER TABLE public.venue_layout_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_layout_objects_select_active_venue
  ON public.venue_layout_objects;

CREATE POLICY venue_layout_objects_select_active_venue
  ON public.venue_layout_objects
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = venue_layout_objects.venue_id
        AND v.status = 'active'
    )
  );

DROP POLICY IF EXISTS venue_layout_objects_select_owner
  ON public.venue_layout_objects;

CREATE POLICY venue_layout_objects_select_owner
  ON public.venue_layout_objects
  FOR SELECT
  TO authenticated
  USING (
    public.owns_venue(venue_layout_objects.venue_id)
    OR public.is_super_admin()
  );

GRANT SELECT ON public.venue_layout_objects TO anon, authenticated;

COMMIT;
