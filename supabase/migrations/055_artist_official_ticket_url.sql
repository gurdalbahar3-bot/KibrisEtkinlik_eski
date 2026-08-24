-- Migration 055 — Artist writes + events.official_ticket_url
-- Scope: reuse public.artists / public.event_artists (multi-artist),
--         events.official_ticket_url (NULL; empty string stores as NULL),
--         SECURITY DEFINER RPCs only (no client DML GRANTs/policies),
--         REPLACE artists_select_public (034 file not edited),
--         admin_audit_log actions ARTIST_UPSERTED / EVENT_ARTISTS_UPDATED /
--         EVENT_OFFICIAL_TICKET_URL_SET.
-- Depends on: 001–054 applied.
-- Does NOT modify: migrations 001–054 (especially 034, 051, 052, 053, 054).
-- Does NOT CREATE OR REPLACE: create_event_atomic, publish_event,
--   submit_event_for_review, approve_event, unpublish_event, postpone_event,
--   reschedule_event, cancel_event, complete_event, decide_event_change_request,
--   propose_event_schedule_change.
-- Does NOT add: spider/AI, payments, checkout, orders, QR, POS, or layout OS.
-- URL is NOT required to publish. Free events publish without URL.
-- We still do not sell tickets.

BEGIN;

-- ============================================================
-- §1 official_ticket_url — nullable; writes via RPC only
-- events_update_owner_draft GRANT list is unchanged — official_ticket_url is NOT added
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS official_ticket_url text NULL;

COMMENT ON COLUMN public.events.official_ticket_url IS
  'External official ticket page. Empty string stores as NULL. Writes via set_event_official_ticket_url only. Not required to publish.';

REVOKE UPDATE (official_ticket_url) ON TABLE public.events
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT (official_ticket_url) ON TABLE public.events
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- §2 No client DML on artists / event_artists
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON TABLE public.artists
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_artists
  FROM PUBLIC, anon, authenticated;

-- No INSERT / UPDATE / DELETE client policies. Writes only via RPC.

-- ============================================================
-- §3 Public artist visibility — REPLACE artists_select_public in 055 only
-- Anon: visible ONLY when linked to event_is_published().
-- Manager/SA: keep visibility for events they can manage; SA sees catalog.
-- Creator sees own rows (unlinked draft artists must not leak to anon).
-- Do not treat artists.is_active as the public event gate.
-- ============================================================

DROP POLICY IF EXISTS artists_select_public ON public.artists;

CREATE POLICY artists_select_public ON public.artists
  FOR SELECT TO anon, authenticated
  USING (
    public.is_super_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.event_artists AS ea
      WHERE ea.artist_id = artists.id
        AND (
          public.event_is_published(ea.event_id)
          OR public.can_manage_event(ea.event_id)
        )
    )
  );

-- ============================================================
-- §4 Helpers (REVOKE PUBLIC/anon; not granted to authenticated)
-- ============================================================

CREATE OR REPLACE FUNCTION public.event_assert_artist_url_writable(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'UNAUTHENTICATED';
  END IF;

  IF p_event_id IS NULL THEN
    RETURN 'EVENT_NOT_FOUND';
  END IF;

  SELECT e.status::text INTO v_status
  FROM public.events AS e
  WHERE e.id = p_event_id;

  IF v_status IS NULL THEN
    RETURN 'EVENT_NOT_FOUND';
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN 'FORBIDDEN';
  END IF;

  -- Owner / manager: draft only. Super Admin may write after draft (NOT publish).
  IF v_status IS DISTINCT FROM 'draft' AND NOT public.is_super_admin() THEN
    RETURN 'FORBIDDEN';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_official_ticket_url(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_rest text;
  v_host text;
BEGIN
  v_raw := NULLIF(btrim(COALESCE(p_url, '')), '');
  IF v_raw IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'url', NULL);
  END IF;

  IF v_raw ~ '[[:space:]]' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_URL');
  END IF;

  IF v_raw !~* '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_URL');
  END IF;

  v_rest := regexp_replace(v_raw, '^https?://', '', 'i');
  IF v_rest ~ '@' THEN
    v_rest := regexp_replace(v_rest, '^[^@]*@', '');
  END IF;

  v_host := split_part(split_part(split_part(v_rest, '/', 1), '?', 1), '#', 1);
  v_host := lower(v_host);

  IF v_host LIKE '[%]' THEN
    v_host := substr(v_host, 2, length(v_host) - 2);
  ELSE
    IF v_host ~ ':[0-9]+$' THEN
      v_host := regexp_replace(v_host, ':[0-9]+$', '');
    END IF;
  END IF;

  IF v_host IS NULL OR v_host = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_URL');
  END IF;

  IF v_host IN (
       'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]',
       'example', 'example.com', 'example.net', 'example.org',
       'invalid', 'invalid.com', 'test', 'test.com'
     )
     OR v_host LIKE '%.localhost'
     OR v_host LIKE '%.example'
     OR v_host LIKE '%.example.com'
     OR v_host LIKE '%.example.net'
     OR v_host LIKE '%.example.org'
     OR v_host LIKE '%.invalid'
     OR v_host LIKE '%.test'
     OR v_host LIKE '10.%'
     OR v_host LIKE '192.168.%'
     OR v_host LIKE '169.254.%'
  THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_URL');
  END IF;

  IF v_host !~ '\.' AND v_host !~ ':' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_URL');
  END IF;

  RETURN jsonb_build_object('ok', true, 'url', v_raw);
END;
$$;

REVOKE ALL ON FUNCTION public.event_assert_artist_url_writable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_official_ticket_url(text) FROM PUBLIC, anon;

-- ============================================================
-- §5 upsert_artist_atomic — create/update name/slug/bio/image
-- created_by = actor on create. Update: Super Admin OR creator.
-- is_active change: Super Admin ONLY.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_artist_atomic(
  p_name text,
  p_slug text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_artist_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_name text;
  v_slug text;
  v_bio text;
  v_image text;
  v_existing public.artists%ROWTYPE;
  v_row public.artists%ROWTYPE;
  v_is_active boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  v_slug := NULLIF(btrim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
  ELSE
    v_slug := lower(v_slug);
  END IF;

  IF v_slug IS NULL OR v_slug = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SLUG_REQUIRED');
  END IF;

  v_bio := NULLIF(btrim(COALESCE(p_bio, '')), '');
  v_image := NULLIF(btrim(COALESCE(p_image_url, '')), '');

  IF EXISTS (
    SELECT 1
    FROM public.artists AS a
    WHERE a.slug = v_slug
      AND (p_artist_id IS NULL OR a.id IS DISTINCT FROM p_artist_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SLUG_CONFLICT');
  END IF;

  IF p_artist_id IS NULL THEN
    IF NOT (
      public.is_super_admin()
      OR public.event_owner_is_eligible(v_actor_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
    END IF;

    IF p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM true
       AND NOT public.is_super_admin() THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
    END IF;

    v_is_active := COALESCE(p_is_active, true);

    INSERT INTO public.artists (
      name, slug, bio, image_url, is_active, created_by
    )
    VALUES (
      v_name, v_slug, v_bio, v_image, v_is_active, v_actor_id
    )
    RETURNING * INTO v_row;

    INSERT INTO public.admin_audit_log (
      actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
    )
    VALUES (
      v_actor_id,
      public.venue_actor_role(),
      'ARTIST_UPSERTED',
      'artist',
      v_row.id,
      NULL,
      jsonb_build_object(
        'name', v_row.name,
        'slug', v_row.slug,
        'is_active', v_row.is_active,
        'created_by', v_row.created_by
      ),
      jsonb_build_object('op', 'create')
    );

    RETURN jsonb_build_object(
      'success', true,
      'artist_id', v_row.id,
      'slug', v_row.slug,
      'created', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.artists
  WHERE id = p_artist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ARTIST_NOT_FOUND');
  END IF;

  IF NOT (
    public.is_super_admin()
    OR v_existing.created_by = v_actor_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  v_is_active := v_existing.is_active;
  IF p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM v_existing.is_active THEN
    IF NOT public.is_super_admin() THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
    END IF;
    v_is_active := p_is_active;
  END IF;

  UPDATE public.artists
  SET
    name = v_name,
    slug = v_slug,
    bio = v_bio,
    image_url = v_image,
    is_active = v_is_active,
    updated_at = now()
  WHERE id = p_artist_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'ARTIST_UPSERTED',
    'artist',
    v_row.id,
    jsonb_build_object(
      'name', v_existing.name,
      'slug', v_existing.slug,
      'is_active', v_existing.is_active
    ),
    jsonb_build_object(
      'name', v_row.name,
      'slug', v_row.slug,
      'is_active', v_row.is_active
    ),
    jsonb_build_object('op', 'update')
  );

  RETURN jsonb_build_object(
    'success', true,
    'artist_id', v_row.id,
    'slug', v_row.slug,
    'created', false
  );
END;
$$;

-- ============================================================
-- §6 set_event_artists_atomic — replace-set (artist_id + role + sort_order)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_event_artists_atomic(
  p_event_id uuid,
  p_artists jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_err text;
  v_old jsonb;
  v_new jsonb;
  v_count int;
  v_distinct int;
  v_found int;
  v_item jsonb;
  v_artist_id uuid;
  v_role text;
  v_sort int;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  v_err := public.event_assert_artist_url_writable(p_event_id);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_err);
  END IF;

  IF p_artists IS NULL OR jsonb_typeof(p_artists) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARTISTS');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_artists) AS elem
    WHERE NULLIF(btrim(elem->>'artist_id'), '') IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARTISTS');
  END IF;

  SELECT count(*), count(DISTINCT btrim(elem->>'artist_id'))
    INTO v_count, v_distinct
  FROM jsonb_array_elements(p_artists) AS elem;

  IF v_count > 0 AND v_distinct IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE_ARTIST');
  END IF;

  SELECT count(*) INTO v_found
  FROM public.artists AS a
  WHERE a.id IN (
    SELECT (NULLIF(btrim(elem->>'artist_id'), ''))::uuid
    FROM jsonb_array_elements(p_artists) AS elem
  );

  IF v_found IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ARTIST_NOT_FOUND');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'artist_id', ea.artist_id,
        'role', ea.role,
        'sort_order', ea.sort_order
      )
      ORDER BY ea.sort_order NULLS LAST, ea.created_at
    ),
    '[]'::jsonb
  )
  INTO v_old
  FROM public.event_artists AS ea
  WHERE ea.event_id = p_event_id;

  DELETE FROM public.event_artists
  WHERE event_id = p_event_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_artists) AS t(value)
  LOOP
    v_artist_id := (NULLIF(btrim(v_item->>'artist_id'), ''))::uuid;
    v_role := COALESCE(NULLIF(btrim(v_item->>'role'), ''), 'performer');
    v_sort := COALESCE(NULLIF(v_item->>'sort_order', '')::int, 0);

    INSERT INTO public.event_artists (event_id, artist_id, role, sort_order)
    VALUES (p_event_id, v_artist_id, v_role, v_sort);
  END LOOP;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'artist_id', ea.artist_id,
        'role', ea.role,
        'sort_order', ea.sort_order
      )
      ORDER BY ea.sort_order NULLS LAST, ea.created_at
    ),
    '[]'::jsonb
  )
  INTO v_new
  FROM public.event_artists AS ea
  WHERE ea.event_id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'EVENT_ARTISTS_UPDATED',
    'event',
    p_event_id,
    v_old,
    v_new,
    jsonb_build_object('count', v_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'count', v_count
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARTISTS');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE_ARTIST');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ARTIST_NOT_FOUND');
END;
$$;

-- ============================================================
-- §7 set_event_official_ticket_url — set or clear; missing URL is not an error
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_event_official_ticket_url(
  p_event_id uuid,
  p_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_err text;
  v_norm jsonb;
  v_url text;
  v_old text;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  v_err := public.event_assert_artist_url_writable(p_event_id);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', v_err);
  END IF;

  v_norm := public.normalize_official_ticket_url(p_url);
  IF (v_norm->>'ok') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', coalesce(v_norm->>'error_code', 'INVALID_URL')
    );
  END IF;

  v_url := v_norm->>'url';

  SELECT e.official_ticket_url INTO v_old
  FROM public.events AS e
  WHERE e.id = p_event_id;

  UPDATE public.events
  SET official_ticket_url = v_url, updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_role, action, target_type, target_id, old_state, new_state, metadata
  )
  VALUES (
    v_actor_id,
    public.venue_actor_role(),
    'EVENT_OFFICIAL_TICKET_URL_SET',
    'event',
    p_event_id,
    jsonb_build_object('official_ticket_url', v_old),
    jsonb_build_object('official_ticket_url', v_url),
    jsonb_build_object('cleared', v_url IS NULL)
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'official_ticket_url', v_url
  );
END;
$$;

-- ============================================================
-- §8 Grants — REVOKE PUBLIC/anon; GRANT authenticated; in-function auth
-- ============================================================

REVOKE ALL ON FUNCTION public.upsert_artist_atomic(text, text, text, text, boolean, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_artists_atomic(uuid, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_official_ticket_url(uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_artist_atomic(text, text, text, text, boolean, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_artists_atomic(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_official_ticket_url(uuid, text)
  TO authenticated;

-- events_update_owner_draft GRANT list is unchanged — official_ticket_url is NOT added
-- events_select_public / events_update_owner_draft kept.
-- URL is NOT required to publish. 055 does not replace publish_event.

COMMIT;
