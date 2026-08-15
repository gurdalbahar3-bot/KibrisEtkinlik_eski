-- Migration 041 — Check-in operations (lists, gates, devices, M2 attendance overlay)
-- Scope: ADDITIVE only — no changes to 001–040 objects.
-- Design: wrapper check_in_scan_atomic; use_qr_atomic unchanged; entry_passes unchanged.

-- ---------------------------------------------------------------------------
-- 1. check_in_lists
-- ---------------------------------------------------------------------------

CREATE TABLE public.check_in_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  allowed_entity_types text[] NOT NULL,
  allowed_sale_categories text[] NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT check_in_lists_event_id_code_unique UNIQUE (event_id, code),

  CONSTRAINT check_in_lists_allowed_entity_types_check CHECK (
    allowed_entity_types <@ ARRAY[
      'ticket',
      'entry_pass',
      'seat_reservation',
      'table_reservation'
    ]::text[]
    AND cardinality(allowed_entity_types) > 0
  ),

  CONSTRAINT check_in_lists_allowed_sale_categories_check CHECK (
    allowed_sale_categories IS NULL
    OR allowed_sale_categories <@ ARRAY[
      'general_admission',
      'table',
      'bistro',
      'vip'
    ]::text[]
  )
);

CREATE INDEX check_in_lists_event_id_is_active_idx
  ON public.check_in_lists (event_id, is_active);

-- ---------------------------------------------------------------------------
-- 2. check_in_gates
-- ---------------------------------------------------------------------------

CREATE TABLE public.check_in_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  code text NOT NULL,
  name text NOT NULL,
  location_label text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT check_in_gates_event_id_code_unique UNIQUE (event_id, code)
);

CREATE INDEX check_in_gates_event_id_is_active_idx
  ON public.check_in_gates (event_id, is_active);

-- ---------------------------------------------------------------------------
-- 3. gate_check_in_lists (M:N)
-- ---------------------------------------------------------------------------

CREATE TABLE public.gate_check_in_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id uuid NOT NULL REFERENCES public.check_in_gates (id) ON DELETE CASCADE,
  check_in_list_id uuid NOT NULL REFERENCES public.check_in_lists (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gate_check_in_lists_gate_id_check_in_list_id_unique
    UNIQUE (gate_id, check_in_list_id)
);

CREATE UNIQUE INDEX gate_check_in_lists_gate_primary_unique
  ON public.gate_check_in_lists (gate_id)
  WHERE is_primary;

CREATE INDEX gate_check_in_lists_gate_id_idx
  ON public.gate_check_in_lists (gate_id);

CREATE INDEX gate_check_in_lists_check_in_list_id_idx
  ON public.gate_check_in_lists (check_in_list_id);

CREATE OR REPLACE FUNCTION public.trg_gate_check_in_lists_event_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_gate_event_id uuid;
  v_list_event_id uuid;
BEGIN
  SELECT g.event_id
  INTO v_gate_event_id
  FROM public.check_in_gates AS g
  WHERE g.id = NEW.gate_id;

  IF v_gate_event_id IS NULL THEN
    RAISE EXCEPTION 'check_in_gates.id % does not exist', NEW.gate_id;
  END IF;

  SELECT l.event_id
  INTO v_list_event_id
  FROM public.check_in_lists AS l
  WHERE l.id = NEW.check_in_list_id;

  IF v_list_event_id IS NULL THEN
    RAISE EXCEPTION 'check_in_lists.id % does not exist', NEW.check_in_list_id;
  END IF;

  IF v_gate_event_id IS DISTINCT FROM v_list_event_id THEN
    RAISE EXCEPTION
      'gate_check_in_lists event mismatch: gate % event %, list % event %',
      NEW.gate_id, v_gate_event_id, NEW.check_in_list_id, v_list_event_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gate_check_in_lists_event_match
  BEFORE INSERT OR UPDATE OF gate_id, check_in_list_id ON public.gate_check_in_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_gate_check_in_lists_event_match();

-- ---------------------------------------------------------------------------
-- 4. check_in_list_rules
-- ---------------------------------------------------------------------------

CREATE TABLE public.check_in_list_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_list_id uuid NOT NULL REFERENCES public.check_in_lists (id) ON DELETE CASCADE,
  allow_entry boolean NOT NULL DEFAULT true,
  allow_exit boolean NOT NULL DEFAULT false,
  allow_multiple_entries boolean NOT NULL DEFAULT false,
  allow_entry_after_exit boolean NOT NULL DEFAULT false,
  re_entry_cooldown_seconds integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT check_in_list_rules_check_in_list_id_unique UNIQUE (check_in_list_id),

  CONSTRAINT check_in_list_rules_re_entry_cooldown_seconds_check CHECK (
    re_entry_cooldown_seconds IS NULL OR re_entry_cooldown_seconds >= 0
  )
);

-- ---------------------------------------------------------------------------
-- 5. check_in_devices
-- ---------------------------------------------------------------------------

CREATE TABLE public.check_in_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id uuid NOT NULL REFERENCES public.check_in_gates (id),
  device_id text NOT NULL,
  device_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  registered_by uuid NOT NULL REFERENCES public.profiles (id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NULL
);

CREATE UNIQUE INDEX check_in_devices_gate_id_device_id_active_unique
  ON public.check_in_devices (gate_id, device_id)
  WHERE is_active;

CREATE INDEX check_in_devices_gate_id_is_active_idx
  ON public.check_in_devices (gate_id)
  WHERE is_active;

CREATE INDEX check_in_devices_device_id_idx
  ON public.check_in_devices (device_id);

-- ---------------------------------------------------------------------------
-- 6. check_in_events (operational audit)
-- ---------------------------------------------------------------------------

CREATE TABLE public.check_in_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  gate_id uuid NULL REFERENCES public.check_in_gates (id),
  check_in_list_id uuid NULL REFERENCES public.check_in_lists (id),
  qr_code_id uuid NULL REFERENCES public.qr_codes (id),
  entity_type text NULL,
  entity_id uuid NULL,
  direction text NOT NULL,
  result text NOT NULL,
  denial_code text NULL,
  scanned_by uuid NULL REFERENCES public.profiles (id),
  device_id text NULL,
  check_in_device_id uuid NULL REFERENCES public.check_in_devices (id),
  client_nonce text NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  is_offline boolean NOT NULL DEFAULT false,
  metadata jsonb NULL,

  CONSTRAINT check_in_events_direction_check CHECK (
    direction IN ('entry', 'exit')
  ),

  CONSTRAINT check_in_events_result_check CHECK (
    result IN (
      'admitted',
      'denied',
      'already_inside',
      'not_inside',
      'revoked',
      'wrong_list',
      'wrong_gate',
      'wrong_entity_type',
      'invalid',
      'forbidden',
      'event_postponed',
      'idempotent_replay'
    )
  )
);

CREATE UNIQUE INDEX check_in_events_device_client_nonce_unique
  ON public.check_in_events (check_in_device_id, client_nonce)
  WHERE client_nonce IS NOT NULL;

CREATE INDEX check_in_events_event_id_scanned_at_idx
  ON public.check_in_events (event_id, scanned_at DESC);

CREATE INDEX check_in_events_gate_id_scanned_at_idx
  ON public.check_in_events (gate_id, scanned_at DESC);

CREATE INDEX check_in_events_check_in_list_id_scanned_at_idx
  ON public.check_in_events (check_in_list_id, scanned_at DESC);

CREATE INDEX check_in_events_qr_code_id_scanned_at_idx
  ON public.check_in_events (qr_code_id, scanned_at DESC);

CREATE INDEX check_in_events_scanned_by_scanned_at_idx
  ON public.check_in_events (scanned_by, scanned_at DESC);

-- ---------------------------------------------------------------------------
-- 7. RLS — enable + SELECT policies only (mutations via RPC)
-- ---------------------------------------------------------------------------

ALTER TABLE public.check_in_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_check_in_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_list_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.check_in_lists TO authenticated;
GRANT SELECT ON public.check_in_gates TO authenticated;
GRANT SELECT ON public.gate_check_in_lists TO authenticated;
GRANT SELECT ON public.check_in_list_rules TO authenticated;
GRANT SELECT ON public.check_in_devices TO authenticated;
GRANT SELECT ON public.check_in_events TO authenticated;

CREATE POLICY check_in_lists_select_scoped ON public.check_in_lists
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.can_manage_event(event_id)
    OR public.can_scan_event(event_id)
  );

CREATE POLICY check_in_gates_select_scoped ON public.check_in_gates
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.can_manage_event(event_id)
    OR public.can_scan_event(event_id)
  );

CREATE POLICY gate_check_in_lists_select_scoped ON public.gate_check_in_lists
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.check_in_gates AS g
      WHERE g.id = gate_id
        AND (
          public.can_manage_event(g.event_id)
          OR public.can_scan_event(g.event_id)
        )
    )
  );

CREATE POLICY check_in_list_rules_select_scoped ON public.check_in_list_rules
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.check_in_lists AS l
      WHERE l.id = check_in_list_id
        AND (
          public.can_manage_event(l.event_id)
          OR public.can_scan_event(l.event_id)
        )
    )
  );

CREATE POLICY check_in_devices_select_scoped ON public.check_in_devices
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.check_in_gates AS g
      WHERE g.id = gate_id
        AND (
          public.can_manage_event(g.event_id)
          OR public.can_scan_event(g.event_id)
        )
    )
  );

CREATE POLICY check_in_events_select_scoped ON public.check_in_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.can_scan_event(event_id)
    OR public.can_settle_event(event_id)
  );

-- ---------------------------------------------------------------------------
-- 8. Internal helpers (REVOKE PUBLIC below)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_qr_inside_state(
  p_qr_code_id uuid,
  p_check_in_list_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT e.direction = 'entry'
      FROM public.check_in_events AS e
      WHERE e.qr_code_id = p_qr_code_id
        AND e.check_in_list_id = p_check_in_list_id
        AND e.result = 'admitted'
      ORDER BY e.scanned_at DESC, e.id DESC
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_check_in_sale_category(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text;
BEGIN
  CASE p_entity_type
    WHEN 'ticket' THEN
      RETURN 'general_admission';
    WHEN 'seat_reservation' THEN
      RETURN 'general_admission';
    WHEN 'table_reservation' THEN
      SELECT tp.sale_category
      INTO v_category
      FROM public.table_reservations AS tr
      JOIN public.table_packages AS tp ON tp.id = tr.package_id
      WHERE tr.id = p_entity_id;
      RETURN v_category;
    WHEN 'entry_pass' THEN
      SELECT tp.sale_category
      INTO v_category
      FROM public.entry_passes AS ep
      JOIN public.table_reservations AS tr
        ON tr.id = ep.parent_id
       AND ep.parent_type = 'table_reservation'
      JOIN public.table_packages AS tp ON tp.id = tr.package_id
      WHERE ep.id = p_entity_id;
      RETURN v_category;
    ELSE
      RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_idempotent_check_in_event(
  p_check_in_device_id uuid,
  p_client_nonce text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.check_in_events AS e
  WHERE e.check_in_device_id = p_check_in_device_id
    AND e.client_nonce = p_client_nonce
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.check_in_record_event(
  p_event_id uuid,
  p_gate_id uuid,
  p_check_in_list_id uuid,
  p_qr_code_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_direction text,
  p_result text,
  p_denial_code text,
  p_scanned_by uuid,
  p_device_id text,
  p_check_in_device_id uuid,
  p_client_nonce text,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.check_in_events (
    event_id,
    gate_id,
    check_in_list_id,
    qr_code_id,
    entity_type,
    entity_id,
    direction,
    result,
    denial_code,
    scanned_by,
    device_id,
    check_in_device_id,
    client_nonce,
    metadata
  )
  VALUES (
    p_event_id,
    p_gate_id,
    p_check_in_list_id,
    p_qr_code_id,
    p_entity_type,
    p_entity_id,
    p_direction,
    p_result,
    p_denial_code,
    p_scanned_by,
    p_device_id,
    p_check_in_device_id,
    p_client_nonce,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  IF p_check_in_device_id IS NOT NULL THEN
    UPDATE public.check_in_devices
    SET last_seen_at = now()
    WHERE id = p_check_in_device_id;
  END IF;

  RETURN v_event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Management RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_check_in_list_atomic(
  p_event_id uuid,
  p_code text,
  p_name text,
  p_allowed_entity_types text[],
  p_list_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0,
  p_allowed_sale_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_list_id uuid := p_list_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_allowed_entity_types IS NULL OR cardinality(p_allowed_entity_types) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ENTITY_TYPES');
  END IF;

  IF p_list_id IS NULL THEN
    INSERT INTO public.check_in_lists (
      event_id, code, name, description, is_active, sort_order,
      allowed_entity_types, allowed_sale_categories, created_by
    )
    VALUES (
      p_event_id, p_code, p_name, p_description, p_is_active, p_sort_order,
      p_allowed_entity_types, p_allowed_sale_categories, v_user_id
    )
    RETURNING id INTO v_list_id;
  ELSE
    UPDATE public.check_in_lists
    SET code = p_code,
        name = p_name,
        description = p_description,
        is_active = p_is_active,
        sort_order = p_sort_order,
        allowed_entity_types = p_allowed_entity_types,
        allowed_sale_categories = p_allowed_sale_categories,
        updated_at = now()
    WHERE id = p_list_id
      AND event_id = p_event_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'LIST_NOT_FOUND');
    END IF;

    v_list_id := p_list_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'list_id', v_list_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_check_in_gate_atomic(
  p_event_id uuid,
  p_code text,
  p_name text,
  p_gate_id uuid DEFAULT NULL,
  p_location_label text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_gate_id uuid := p_gate_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_gate_id IS NULL THEN
    INSERT INTO public.check_in_gates (
      event_id, code, name, location_label, is_active, created_by
    )
    VALUES (
      p_event_id, p_code, p_name, p_location_label, p_is_active, v_user_id
    )
    RETURNING id INTO v_gate_id;
  ELSE
    UPDATE public.check_in_gates
    SET code = p_code,
        name = p_name,
        location_label = p_location_label,
        is_active = p_is_active,
        updated_at = now()
    WHERE id = p_gate_id
      AND event_id = p_event_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'GATE_NOT_FOUND');
    END IF;

    v_gate_id := p_gate_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'gate_id', v_gate_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_gate_check_in_list_atomic(
  p_gate_id uuid,
  p_check_in_list_id uuid,
  p_is_primary boolean DEFAULT false,
  p_priority integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_link_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT g.event_id
  INTO v_event_id
  FROM public.check_in_gates AS g
  WHERE g.id = p_gate_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'GATE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_event(v_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_is_primary THEN
    UPDATE public.gate_check_in_lists
    SET is_primary = false
    WHERE gate_id = p_gate_id
      AND is_primary;
  END IF;

  INSERT INTO public.gate_check_in_lists (
    gate_id, check_in_list_id, is_primary, priority
  )
  VALUES (
    p_gate_id, p_check_in_list_id, p_is_primary, p_priority
  )
  ON CONFLICT (gate_id, check_in_list_id) DO UPDATE
  SET is_primary = EXCLUDED.is_primary,
      priority = EXCLUDED.priority
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object(
    'success', true,
    'link_id', v_link_id,
    'gate_id', p_gate_id,
    'check_in_list_id', p_check_in_list_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_gate_check_in_list_atomic(
  p_gate_id uuid,
  p_check_in_list_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT g.event_id
  INTO v_event_id
  FROM public.check_in_gates AS g
  WHERE g.id = p_gate_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'GATE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_event(v_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  DELETE FROM public.gate_check_in_lists
  WHERE gate_id = p_gate_id
    AND check_in_list_id = p_check_in_list_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'LINK_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_check_in_list_rules_atomic(
  p_check_in_list_id uuid,
  p_allow_entry boolean DEFAULT true,
  p_allow_exit boolean DEFAULT false,
  p_allow_multiple_entries boolean DEFAULT false,
  p_allow_entry_after_exit boolean DEFAULT false,
  p_re_entry_cooldown_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_rules_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT l.event_id
  INTO v_event_id
  FROM public.check_in_lists AS l
  WHERE l.id = p_check_in_list_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'LIST_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_event(v_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  INSERT INTO public.check_in_list_rules (
    check_in_list_id,
    allow_entry,
    allow_exit,
    allow_multiple_entries,
    allow_entry_after_exit,
    re_entry_cooldown_seconds
  )
  VALUES (
    p_check_in_list_id,
    p_allow_entry,
    p_allow_exit,
    p_allow_multiple_entries,
    p_allow_entry_after_exit,
    p_re_entry_cooldown_seconds
  )
  ON CONFLICT (check_in_list_id) DO UPDATE
  SET allow_entry = EXCLUDED.allow_entry,
      allow_exit = EXCLUDED.allow_exit,
      allow_multiple_entries = EXCLUDED.allow_multiple_entries,
      allow_entry_after_exit = EXCLUDED.allow_entry_after_exit,
      re_entry_cooldown_seconds = EXCLUDED.re_entry_cooldown_seconds,
      updated_at = now()
  RETURNING id INTO v_rules_id;

  RETURN jsonb_build_object('success', true, 'rules_id', v_rules_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_check_in_device_atomic(
  p_gate_id uuid,
  p_device_id text,
  p_device_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_device_row_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT g.event_id
  INTO v_event_id
  FROM public.check_in_gates AS g
  WHERE g.id = p_gate_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'GATE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_event(v_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  UPDATE public.check_in_devices
  SET is_active = false
  WHERE gate_id = p_gate_id
    AND device_id = p_device_id
    AND is_active;

  INSERT INTO public.check_in_devices (
    gate_id, device_id, device_name, is_active, registered_by
  )
  VALUES (
    p_gate_id, p_device_id, p_device_name, true, v_user_id
  )
  RETURNING id INTO v_device_row_id;

  RETURN jsonb_build_object(
    'success', true,
    'check_in_device_id', v_device_row_id,
    'gate_id', p_gate_id,
    'device_id', p_device_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_check_in_device_atomic(
  p_check_in_device_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT g.event_id
  INTO v_event_id
  FROM public.check_in_devices AS d
  JOIN public.check_in_gates AS g ON g.id = d.gate_id
  WHERE d.id = p_check_in_device_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DEVICE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_event(v_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  UPDATE public.check_in_devices
  SET is_active = false
  WHERE id = p_check_in_device_id
    AND is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DEVICE_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true, 'check_in_device_id', p_check_in_device_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. check_in_scan_atomic — M2 attendance overlay wrapper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_in_scan_atomic(
  p_token text,
  p_gate_id uuid,
  p_direction text,
  p_device_id text,
  p_check_in_list_id uuid DEFAULT NULL,
  p_client_nonce text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_gate public.check_in_gates%ROWTYPE;
  v_list public.check_in_lists%ROWTYPE;
  v_rules public.check_in_list_rules%ROWTYPE;
  v_device public.check_in_devices%ROWTYPE;
  v_qr public.qr_codes%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_check_in_device_id uuid := NULL;
  v_prior_event_id uuid;
  v_replay_direction text;
  v_list_id uuid;
  v_inside boolean;
  v_sale_category text;
  v_use_qr_result jsonb;
  v_event_id uuid;
  v_result text;
  v_denial_code text;
  v_event_record_id uuid;
  v_last_exit_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_direction NOT IN ('entry', 'exit') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_DIRECTION');
  END IF;

  SELECT *
  INTO v_gate
  FROM public.check_in_gates
  WHERE id = p_gate_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'GATE_NOT_FOUND');
  END IF;

  IF NOT v_gate.is_active THEN
    v_event_id := v_gate.event_id;
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, NULL, NULL, NULL, NULL,
      p_direction, 'denied', 'GATE_INACTIVE',
      v_user_id, p_device_id, NULL, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'GATE_INACTIVE',
      'result', 'denied',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  v_event_id := v_gate.event_id;

  SELECT *
  INTO v_device
  FROM public.check_in_devices
  WHERE gate_id = p_gate_id
    AND device_id = p_device_id
    AND is_active;

  IF p_client_nonce IS NOT NULL AND NOT FOUND THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, NULL, NULL, NULL, NULL,
      p_direction, 'denied', 'DEVICE_NOT_REGISTERED',
      v_user_id, p_device_id, NULL, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEVICE_NOT_REGISTERED',
      'result', 'denied',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  IF FOUND THEN
    v_check_in_device_id := v_device.id;
    IF p_client_nonce IS NOT NULL THEN
      v_prior_event_id := public.find_idempotent_check_in_event(v_check_in_device_id, p_client_nonce);
      IF v_prior_event_id IS NOT NULL THEN
        SELECT e.result, e.direction
        INTO v_result, v_replay_direction
        FROM public.check_in_events AS e
        WHERE e.id = v_prior_event_id;

        RETURN jsonb_build_object(
          'success', v_result = 'admitted',
          'result', 'idempotent_replay',
          'check_in_event_id', v_prior_event_id,
          'direction', v_replay_direction,
          'original_result', v_result,
          'noop', true
        );
      END IF;
    END IF;
  END IF;

  IF p_check_in_list_id IS NOT NULL THEN
    v_list_id := p_check_in_list_id;
    IF NOT EXISTS (
      SELECT 1
      FROM public.gate_check_in_lists AS gl
      WHERE gl.gate_id = p_gate_id
        AND gl.check_in_list_id = p_check_in_list_id
    ) THEN
      v_event_record_id := public.check_in_record_event(
        v_event_id, p_gate_id, p_check_in_list_id, NULL, NULL, NULL,
        p_direction, 'wrong_list', 'LIST_NOT_LINKED_TO_GATE',
        v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
      );
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'WRONG_LIST',
        'result', 'wrong_list',
        'check_in_event_id', v_event_record_id
      );
    END IF;
  ELSE
    SELECT gl.check_in_list_id
    INTO v_list_id
    FROM public.gate_check_in_lists AS gl
    WHERE gl.gate_id = p_gate_id
      AND gl.is_primary
    ORDER BY gl.priority DESC, gl.created_at ASC
    LIMIT 1;

    IF v_list_id IS NULL THEN
      v_event_record_id := public.check_in_record_event(
        v_event_id, p_gate_id, NULL, NULL, NULL, NULL,
        p_direction, 'denied', 'NO_CHECK_IN_LIST',
        v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
      );
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NO_CHECK_IN_LIST',
        'result', 'denied',
        'check_in_event_id', v_event_record_id
      );
    END IF;
  END IF;

  SELECT *
  INTO v_list
  FROM public.check_in_lists
  WHERE id = v_list_id
    AND event_id = v_event_id;

  IF NOT FOUND OR NOT v_list.is_active THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, v_list_id, NULL, NULL, NULL,
      p_direction, 'wrong_list', 'LIST_NOT_FOUND_OR_INACTIVE',
      v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'WRONG_LIST',
      'result', 'wrong_list',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  IF NOT public.can_scan_event(v_event_id) THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, v_list_id, NULL, NULL, NULL,
      p_direction, 'forbidden', 'SCAN_FORBIDDEN',
      v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'FORBIDDEN',
      'result', 'forbidden',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  SELECT *
  INTO v_qr
  FROM public.qr_codes
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, v_list_id, NULL, NULL, NULL,
      p_direction, 'invalid', 'QR_NOT_FOUND',
      v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID',
      'result', 'invalid',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  IF v_qr.event_id IS DISTINCT FROM v_event_id THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, v_list_id, v_qr.id, v_qr.entity_type, v_qr.entity_id,
      p_direction, 'denied', 'WRONG_EVENT',
      v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'WRONG_EVENT',
      'result', 'denied',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  SELECT *
  INTO v_event
  FROM public.events
  WHERE id = v_event_id;

  IF v_event.status = 'postponed' THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, v_list_id, v_qr.id, v_qr.entity_type, v_qr.entity_id,
      p_direction, 'event_postponed', 'EVENT_POSTPONED',
      v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'EVENT_POSTPONED',
      'result', 'event_postponed',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  IF NOT (v_qr.entity_type = ANY (v_list.allowed_entity_types)) THEN
    v_event_record_id := public.check_in_record_event(
      v_event_id, p_gate_id, v_list_id, v_qr.id, v_qr.entity_type, v_qr.entity_id,
      p_direction, 'wrong_entity_type', 'ENTITY_TYPE_NOT_ALLOWED',
      v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'WRONG_ENTITY_TYPE',
      'result', 'wrong_entity_type',
      'check_in_event_id', v_event_record_id
    );
  END IF;

  IF v_list.allowed_sale_categories IS NOT NULL THEN
    v_sale_category := public.resolve_check_in_sale_category(v_qr.entity_type, v_qr.entity_id);
    IF v_sale_category IS NULL
       OR NOT (v_sale_category = ANY (v_list.allowed_sale_categories)) THEN
      v_event_record_id := public.check_in_record_event(
        v_event_id, p_gate_id, v_list_id, v_qr.id, v_qr.entity_type, v_qr.entity_id,
        p_direction, 'wrong_entity_type', 'SALE_CATEGORY_NOT_ALLOWED',
        v_user_id, p_device_id, v_check_in_device_id, p_client_nonce, NULL
      );
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'WRONG_ENTITY_TYPE',
        'result', 'wrong_entity_type',
        'check_in_event_id', v_event_record_id
      );
    END IF;
  END IF;

  SELECT *
  INTO v_rules
  FROM public.check_in_list_rules
  WHERE check_in_list_id = v_list_id;

  IF NOT FOUND THEN
    v_rules.allow_entry := true;
    v_rules.allow_exit := false;
    v_rules.allow_multiple_entries := false;
    v_rules.allow_entry_after_exit := false;
    v_rules.re_entry_cooldown_seconds := NULL;
  END IF;

  v_inside := public.get_qr_inside_state(v_qr.id, v_list_id);

  IF p_direction = 'entry' THEN
    IF NOT v_rules.allow_entry THEN
      v_result := 'denied';
      v_denial_code := 'ENTRY_NOT_ALLOWED';
    ELSIF v_qr.status = 'revoked' THEN
      v_result := 'revoked';
      v_denial_code := 'QR_REVOKED';
    ELSIF v_inside THEN
      v_result := 'already_inside';
      v_denial_code := 'ALREADY_INSIDE';
    ELSIF v_qr.status = 'active' THEN
      v_use_qr_result := public.use_qr_atomic(p_token, p_device_id);
      IF COALESCE((v_use_qr_result ->> 'success')::boolean, false) THEN
        v_result := 'admitted';
        v_denial_code := NULL;
      ELSE
        v_result := CASE v_use_qr_result ->> 'error_code'
          WHEN 'INVALID' THEN 'invalid'
          WHEN 'FORBIDDEN' THEN 'forbidden'
          WHEN 'EVENT_POSTPONED' THEN 'event_postponed'
          WHEN 'ALREADY_USED' THEN 'already_inside'
          WHEN 'REVOKED' THEN 'revoked'
          ELSE 'denied'
        END;
        v_denial_code := v_use_qr_result ->> 'error_code';
      END IF;
    ELSIF v_qr.status = 'used' THEN
      IF NOT v_rules.allow_multiple_entries THEN
        v_result := 'denied';
        v_denial_code := 'REENTRY_NOT_ALLOWED';
      ELSIF NOT v_rules.allow_entry_after_exit THEN
        v_result := 'denied';
        v_denial_code := 'REENTRY_AFTER_EXIT_NOT_ALLOWED';
      ELSE
        IF v_rules.re_entry_cooldown_seconds IS NOT NULL THEN
          SELECT e.scanned_at
          INTO v_last_exit_at
          FROM public.check_in_events AS e
          WHERE e.qr_code_id = v_qr.id
            AND e.check_in_list_id = v_list_id
            AND e.result = 'admitted'
            AND e.direction = 'exit'
          ORDER BY e.scanned_at DESC, e.id DESC
          LIMIT 1;

          IF v_last_exit_at IS NOT NULL
             AND now() < v_last_exit_at + make_interval(secs => v_rules.re_entry_cooldown_seconds) THEN
            v_result := 'denied';
            v_denial_code := 'REENTRY_COOLDOWN';
          ELSE
            v_result := 'admitted';
            v_denial_code := NULL;
          END IF;
        ELSE
          v_result := 'admitted';
          v_denial_code := NULL;
        END IF;
      END IF;
    ELSE
      v_result := 'denied';
      v_denial_code := 'QR_STATUS_UNSUPPORTED';
    END IF;
  ELSE
    IF NOT v_rules.allow_exit THEN
      v_result := 'denied';
      v_denial_code := 'EXIT_NOT_ALLOWED';
    ELSIF NOT v_inside THEN
      v_result := 'not_inside';
      v_denial_code := 'NOT_INSIDE';
    ELSE
      v_result := 'admitted';
      v_denial_code := NULL;
    END IF;
  END IF;

  v_event_record_id := public.check_in_record_event(
    v_event_id,
    p_gate_id,
    v_list_id,
    v_qr.id,
    v_qr.entity_type,
    v_qr.entity_id,
    p_direction,
    v_result,
    v_denial_code,
    v_user_id,
    p_device_id,
    v_check_in_device_id,
    p_client_nonce,
    CASE
      WHEN v_use_qr_result IS NOT NULL THEN
        jsonb_build_object('use_qr_result', v_use_qr_result)
      ELSE NULL
    END
  );

  IF v_result = 'admitted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'result', v_result,
      'direction', p_direction,
      'check_in_event_id', v_event_record_id,
      'qr_code_id', v_qr.id,
      'inside_after', public.get_qr_inside_state(v_qr.id, v_list_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error_code', COALESCE(v_denial_code, upper(v_result)),
    'result', v_result,
    'direction', p_direction,
    'check_in_event_id', v_event_record_id,
    'qr_code_id', v_qr.id,
    'inside_after', public.get_qr_inside_state(v_qr.id, v_list_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. REVOKE / GRANT
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_qr_inside_state(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_check_in_sale_category(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_idempotent_check_in_event(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_record_event(
  uuid, uuid, uuid, uuid, text, uuid, text, text, text, uuid, text, uuid, text, jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_check_in_list_atomic(
  uuid, text, text, text[], uuid, text, boolean, integer, text[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_check_in_gate_atomic(
  uuid, text, text, uuid, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_gate_check_in_list_atomic(uuid, uuid, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_gate_check_in_list_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_check_in_list_rules_atomic(
  uuid, boolean, boolean, boolean, boolean, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_check_in_device_atomic(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_check_in_device_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_scan_atomic(
  text, uuid, text, text, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_check_in_list_atomic(
  uuid, text, text, text[], uuid, text, boolean, integer, text[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_check_in_gate_atomic(
  uuid, text, text, uuid, text, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_gate_check_in_list_atomic(uuid, uuid, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_gate_check_in_list_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_check_in_list_rules_atomic(
  uuid, boolean, boolean, boolean, boolean, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_check_in_device_atomic(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_check_in_device_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_scan_atomic(
  text, uuid, text, text, uuid, text
) TO authenticated;
