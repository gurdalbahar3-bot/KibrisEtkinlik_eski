-- Migration 047 — Event Core Metadata Setup
-- Scope: event_formats, event_locations, event_venue_contacts, wedding_details mutation RPCs.
-- Auth: can_manage_event (organizer / event staff). No draft-only status gate.
-- Depends on: 011, 012, 019, 034.
-- Does NOT modify: 001–046, existing RPC bodies, RLS policies, events DML.

BEGIN;

-- ============================================================
-- §1 Internal helpers (REVOKE PUBLIC only — not granted to authenticated)
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_metadata_assert_format_in_event(
  p_event_id uuid,
  p_format_id uuid
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
    FROM public.event_formats AS ef
    WHERE ef.id = p_format_id
      AND ef.event_id = p_event_id
  ) THEN
    RETURN 'FORMAT_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_metadata_assert_contact_in_event(
  p_event_id uuid,
  p_contact_id uuid
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
    FROM public.event_venue_contacts AS evc
    WHERE evc.id = p_contact_id
      AND evc.event_id = p_event_id
  ) THEN
    RETURN 'CONTACT_NOT_FOUND';
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- §2 event_formats
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_event_format_atomic(
  p_event_id uuid,
  p_format_type text,
  p_format_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_existing public.event_formats%ROWTYPE;
  v_id uuid := p_format_id;
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

  IF p_format_type IS NULL OR p_format_type NOT IN (
    'general_admission', 'seated', 'table_reservation'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_FORMAT_TYPE');
  END IF;

  IF v_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.event_formats AS ef
      WHERE ef.event_id = p_event_id
        AND ef.format_type = p_format_type
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE_FORMAT_TYPE');
    END IF;

    INSERT INTO public.event_formats (event_id, format_type)
    VALUES (p_event_id, p_format_type)
    RETURNING id INTO v_id;
  ELSE
    v_scope_error := public.event_metadata_assert_format_in_event(p_event_id, v_id);
    IF v_scope_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
    END IF;

    SELECT * INTO v_existing
    FROM public.event_formats
    WHERE id = v_id;

    IF v_existing.format_type IS DISTINCT FROM p_format_type
       AND EXISTS (
         SELECT 1
         FROM public.event_formats AS ef
         WHERE ef.event_id = p_event_id
           AND ef.format_type = p_format_type
           AND ef.id <> v_id
       ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE_FORMAT_TYPE');
    END IF;

    UPDATE public.event_formats
    SET format_type = p_format_type
    WHERE id = v_id
      AND event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'format_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event_format_atomic(
  p_event_id uuid,
  p_format_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_scope_error := public.event_metadata_assert_format_in_event(p_event_id, p_format_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  DELETE FROM public.event_formats
  WHERE id = p_format_id
    AND event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'format_id', p_format_id);
END;
$$;

-- ============================================================
-- §3 event_locations
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_event_location_atomic(
  p_event_id uuid,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_directions_text text DEFAULT NULL
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
      event_id, address, city, region, latitude, longitude, directions_text
    )
    VALUES (
      p_event_id, p_address, p_city, p_region, p_latitude, p_longitude, p_directions_text
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
        directions_text = COALESCE(p_directions_text, v_existing.directions_text)
    WHERE event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event_location_atomic(
  p_event_id uuid
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

  IF NOT EXISTS (
    SELECT 1 FROM public.event_locations WHERE event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'LOCATION_NOT_FOUND');
  END IF;

  DELETE FROM public.event_locations
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- ============================================================
-- §4 event_venue_contacts
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_event_venue_contact_atomic(
  p_event_id uuid,
  p_venue_id uuid,
  p_venue_name text,
  p_contact_full_name text,
  p_contact_phone text,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
  v_event public.events%ROWTYPE;
  v_existing public.event_venue_contacts%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF p_venue_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.venues WHERE id = p_venue_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NOT_FOUND');
  END IF;

  IF p_venue_id <> v_event.venue_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_EVENT_MISMATCH');
  END IF;

  IF p_venue_name IS NULL OR btrim(p_venue_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'VENUE_NAME_REQUIRED');
  END IF;

  IF p_contact_full_name IS NULL OR btrim(p_contact_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONTACT_NAME_REQUIRED');
  END IF;

  IF p_contact_phone IS NULL OR btrim(p_contact_phone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CONTACT_PHONE_REQUIRED');
  END IF;

  IF p_contact_id IS NOT NULL THEN
    v_scope_error := public.event_metadata_assert_contact_in_event(p_event_id, p_contact_id);
    IF v_scope_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
    END IF;

    UPDATE public.event_venue_contacts
    SET venue_id = p_venue_id,
        venue_name = btrim(p_venue_name),
        contact_full_name = btrim(p_contact_full_name),
        contact_phone = btrim(p_contact_phone)
    WHERE id = p_contact_id
      AND event_id = p_event_id
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.event_venue_contacts
    WHERE event_id = p_event_id;

    IF FOUND THEN
      UPDATE public.event_venue_contacts
      SET venue_id = p_venue_id,
          venue_name = btrim(p_venue_name),
          contact_full_name = btrim(p_contact_full_name),
          contact_phone = btrim(p_contact_phone)
      WHERE event_id = p_event_id
      RETURNING id INTO v_id;
    ELSE
      INSERT INTO public.event_venue_contacts (
        event_id,
        venue_id,
        venue_name,
        contact_full_name,
        contact_phone,
        verification_status,
        verified_at
      )
      VALUES (
        p_event_id,
        p_venue_id,
        btrim(p_venue_name),
        btrim(p_contact_full_name),
        btrim(p_contact_phone),
        'pending',
        NULL
      )
      RETURNING id INTO v_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'contact_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event_venue_contact_atomic(
  p_event_id uuid,
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_scope_error := public.event_metadata_assert_contact_in_event(p_event_id, p_contact_id);
  IF v_scope_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_scope_error);
  END IF;

  DELETE FROM public.event_venue_contacts
  WHERE id = p_contact_id
    AND event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'contact_id', p_contact_id);
END;
$$;

-- ============================================================
-- §5 wedding_details
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_event_wedding_details_atomic(
  p_event_id uuid,
  p_bride_name text,
  p_groom_name text,
  p_calendar_export_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_existing public.wedding_details%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF NOT v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_WEDDING_EVENT');
  END IF;

  IF p_bride_name IS NULL OR btrim(p_bride_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'BRIDE_NAME_REQUIRED');
  END IF;

  IF p_groom_name IS NULL OR btrim(p_groom_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'GROOM_NAME_REQUIRED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.wedding_details WHERE event_id = p_event_id
  ) THEN
    INSERT INTO public.wedding_details (
      event_id, bride_name, groom_name, calendar_export_url
    )
    VALUES (
      p_event_id,
      btrim(p_bride_name),
      btrim(p_groom_name),
      p_calendar_export_url
    );
  ELSE
    SELECT * INTO v_existing
    FROM public.wedding_details
    WHERE event_id = p_event_id;

    UPDATE public.wedding_details
    SET bride_name = btrim(p_bride_name),
        groom_name = btrim(p_groom_name),
        calendar_export_url = COALESCE(p_calendar_export_url, v_existing.calendar_export_url)
    WHERE event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_event_wedding_details_atomic(
  p_event_id uuid
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

  IF NOT EXISTS (
    SELECT 1 FROM public.wedding_details WHERE event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEDDING_DETAILS_NOT_FOUND');
  END IF;

  DELETE FROM public.wedding_details
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- ============================================================
-- §6 REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.event_metadata_assert_format_in_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_metadata_assert_contact_in_event(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_event_format_atomic(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_event_format_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_location_atomic(
  uuid, text, text, text, numeric, numeric, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_event_location_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_venue_contact_atomic(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_event_venue_contact_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_wedding_details_atomic(
  uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_event_wedding_details_atomic(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_event_format_atomic(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_format_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_location_atomic(
  uuid, text, text, text, numeric, numeric, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_location_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_venue_contact_atomic(
  uuid, uuid, text, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_venue_contact_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_wedding_details_atomic(
  uuid, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_wedding_details_atomic(uuid) TO authenticated;

COMMIT;
