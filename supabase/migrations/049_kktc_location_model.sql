-- Migration 049 — KKTC Location Model
-- Scope: kktc_districts (6 canonical districts), district_id FKs, deterministic backfill.
-- Depends on: 001–048 applied.
-- Does NOT modify: migrations 001–048, city/region columns, events table (no events.district_id).

BEGIN;

-- ============================================================
-- §1 Canonical districts table
-- ============================================================

CREATE TABLE public.kktc_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_tr text NOT NULL,
  name_en text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kktc_districts_code_unique UNIQUE (code),
  CONSTRAINT kktc_districts_code_check CHECK (
    code IN ('lefkosa', 'girne', 'gazimagusa', 'guzelyurt', 'lefke', 'iskele')
  ),
  CONSTRAINT kktc_districts_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX kktc_districts_sort_order_idx
  ON public.kktc_districts (sort_order)
  WHERE is_active = true;

CREATE INDEX kktc_districts_is_active_idx
  ON public.kktc_districts (is_active);

-- ============================================================
-- §2 Seed — all 6 canonical districts (İskele mandatory)
-- ============================================================

INSERT INTO public.kktc_districts (code, name_tr, name_en, sort_order)
VALUES
  ('lefkosa', 'Lefkoşa', 'Nicosia', 1),
  ('gazimagusa', 'Gazimağusa', 'Famagusta', 2),
  ('girne', 'Girne', 'Kyrenia', 3),
  ('guzelyurt', 'Güzelyurt', 'Morphou', 4),
  ('lefke', 'Lefke', 'Lefka', 5),
  ('iskele', 'İskele', 'Trikomo', 6)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.kktc_districts
  WHERE is_active = true;

  IF v_count <> 6 THEN
    RAISE EXCEPTION '049 seed verification failed: expected 6 active districts, got %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.kktc_districts
    WHERE code = 'iskele' AND name_tr = 'İskele'
  ) THEN
    RAISE EXCEPTION '049 seed verification failed: İskele district missing or incorrect';
  END IF;
END $$;

-- ============================================================
-- §3 Additive nullable district FK columns
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN district_id uuid NULL REFERENCES public.kktc_districts (id);

ALTER TABLE public.event_locations
  ADD COLUMN district_id uuid NULL REFERENCES public.kktc_districts (id);

CREATE INDEX venues_district_id_idx
  ON public.venues (district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX event_locations_district_id_idx
  ON public.event_locations (district_id)
  WHERE district_id IS NOT NULL;

-- ============================================================
-- §4 Location text → district code helpers (deterministic only)
-- ============================================================

CREATE OR REPLACE FUNCTION public.kktc_normalize_location_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN NULL
    ELSE lower(
      translate(
        btrim(p_text),
        'İIıŞşĞğÜüÖöÇç',
        'iiisssgguuoocc'
      )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.kktc_district_code_from_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN public.kktc_normalize_location_text(p_text) IN ('lefkosa', 'nicosia') THEN 'lefkosa'
    WHEN public.kktc_normalize_location_text(p_text) IN ('gazimagusa', 'magosa', 'famagusta') THEN 'gazimagusa'
    WHEN public.kktc_normalize_location_text(p_text) IN ('girne', 'kyrenia') THEN 'girne'
    WHEN public.kktc_normalize_location_text(p_text) IN ('guzelyurt', 'morphou') THEN 'guzelyurt'
    WHEN public.kktc_normalize_location_text(p_text) IN ('lefke', 'lefka') THEN 'lefke'
    WHEN public.kktc_normalize_location_text(p_text) IN ('iskele', 'trikomo', 'yeni iskele') THEN 'iskele'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.kktc_resolve_district_code(p_city text, p_region text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_city_code text;
  v_region_code text;
BEGIN
  v_city_code := public.kktc_district_code_from_text(p_city);
  v_region_code := public.kktc_district_code_from_text(p_region);

  IF v_city_code IS NOT NULL
     AND v_region_code IS NOT NULL
     AND v_city_code <> v_region_code THEN
    RETURN NULL;
  END IF;

  RETURN COALESCE(v_city_code, v_region_code);
END;
$$;

-- ============================================================
-- §5 Deterministic backfill (ambiguous rows left NULL for review)
-- ============================================================

UPDATE public.venues AS v
SET district_id = d.id
FROM public.kktc_districts AS d
WHERE v.district_id IS NULL
  AND public.kktc_resolve_district_code(v.city, v.region) = d.code;

UPDATE public.event_locations AS el
SET district_id = v.district_id
FROM public.events AS e
JOIN public.venues AS v ON v.id = e.venue_id
WHERE el.event_id = e.id
  AND el.district_id IS NULL
  AND v.district_id IS NOT NULL;

UPDATE public.event_locations AS el
SET district_id = d.id
FROM public.kktc_districts AS d
WHERE el.district_id IS NULL
  AND public.kktc_resolve_district_code(el.city, el.region) = d.code;

-- ============================================================
-- §6 Review views (unmapped rows remain valid)
-- ============================================================

CREATE OR REPLACE VIEW public.venues_location_unmapped AS
SELECT
  v.id,
  v.city,
  v.region
FROM public.venues AS v
WHERE v.district_id IS NULL
  AND (v.city IS NOT NULL OR v.region IS NOT NULL);

CREATE OR REPLACE VIEW public.event_locations_unmapped AS
SELECT
  el.event_id,
  el.city,
  el.region
FROM public.event_locations AS el
WHERE el.district_id IS NULL
  AND (el.city IS NOT NULL OR el.region IS NOT NULL);

-- ============================================================
-- §7 RLS — public read, super-admin mutations
-- ============================================================

ALTER TABLE public.kktc_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY kktc_districts_select_public ON public.kktc_districts
  FOR SELECT
  USING (true);

CREATE POLICY kktc_districts_insert_super_admin ON public.kktc_districts
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY kktc_districts_update_super_admin ON public.kktc_districts
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY kktc_districts_delete_super_admin ON public.kktc_districts
  FOR DELETE
  USING (public.is_super_admin());

GRANT SELECT ON public.kktc_districts TO anon, authenticated;
GRANT SELECT ON public.venues_location_unmapped TO anon, authenticated;
GRANT SELECT ON public.event_locations_unmapped TO anon, authenticated;

-- ============================================================
-- §8 Extend upsert_event_location_atomic — optional district_id
-- ============================================================

DROP FUNCTION IF EXISTS public.upsert_event_location_atomic(
  uuid, text, text, text, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION public.upsert_event_location_atomic(
  p_event_id uuid,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_directions_text text DEFAULT NULL,
  p_district_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.event_locations%ROWTYPE;
  v_effective_latitude numeric;
  v_effective_longitude numeric;
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

  IF p_district_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.kktc_districts
       WHERE id = p_district_id AND is_active = true
     ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_DISTRICT');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_locations WHERE event_id = p_event_id
  ) THEN
    IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COORDINATES');
    END IF;

    IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COORDINATES');
    END IF;

    IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COORDINATES');
    END IF;

    INSERT INTO public.event_locations (
      event_id, address, city, region, latitude, longitude, directions_text, district_id
    )
    VALUES (
      p_event_id, p_address, p_city, p_region, p_latitude, p_longitude, p_directions_text, p_district_id
    );
  ELSE
    SELECT * INTO v_existing
    FROM public.event_locations
    WHERE event_id = p_event_id;

    v_effective_latitude := COALESCE(p_latitude, v_existing.latitude);
    v_effective_longitude := COALESCE(p_longitude, v_existing.longitude);

    IF (v_effective_latitude IS NULL) <> (v_effective_longitude IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COORDINATES');
    END IF;

    IF v_effective_latitude IS NOT NULL
       AND (v_effective_latitude < -90 OR v_effective_latitude > 90) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COORDINATES');
    END IF;

    IF v_effective_longitude IS NOT NULL
       AND (v_effective_longitude < -180 OR v_effective_longitude > 180) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_COORDINATES');
    END IF;

    UPDATE public.event_locations
    SET address = COALESCE(p_address, v_existing.address),
        city = COALESCE(p_city, v_existing.city),
        region = COALESCE(p_region, v_existing.region),
        latitude = COALESCE(p_latitude, v_existing.latitude),
        longitude = COALESCE(p_longitude, v_existing.longitude),
        directions_text = COALESCE(p_directions_text, v_existing.directions_text),
        district_id = COALESCE(p_district_id, v_existing.district_id)
    WHERE event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- ============================================================
-- §9 REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.kktc_normalize_location_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kktc_district_code_from_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kktc_resolve_district_code(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_event_location_atomic(
  uuid, text, text, text, numeric, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.kktc_normalize_location_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kktc_district_code_from_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kktc_resolve_district_code(text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_event_location_atomic(
  uuid, text, text, text, numeric, numeric, text, uuid
) TO authenticated;

COMMIT;

-- ============================================================
-- §10 Post-apply verification queries (run manually after apply)
-- ============================================================
-- SELECT count(*) AS active_districts FROM public.kktc_districts WHERE is_active;
-- SELECT code, name_tr, name_en, sort_order FROM public.kktc_districts ORDER BY sort_order;
-- SELECT code, name_tr FROM public.kktc_districts WHERE code = 'iskele';
-- SELECT count(*) AS venues_linked FROM public.venues WHERE district_id IS NOT NULL;
-- SELECT count(*) AS event_locations_linked FROM public.event_locations WHERE district_id IS NOT NULL;
-- SELECT count(*) AS venues_unmapped FROM public.venues_location_unmapped;
-- SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND relname = 'kktc_districts';
-- SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kktc_districts';
