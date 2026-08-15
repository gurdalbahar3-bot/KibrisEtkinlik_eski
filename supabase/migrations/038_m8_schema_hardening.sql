-- Migration 038 — M8 schema hardening (decisions 033-M8 D8, D11-A…D, E1, E2, E5)
-- Scope: ADDITIVE DDL + validation triggers + RLS. NO RPC behavior change.
-- Migrations 035 / 036 / 037 are not modified.

-- ---------------------------------------------------------------------------
-- 1. event_tables.max_guests cross-table validation (D8, E1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_event_tables_max_guests_within_venue_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_venue_capacity integer;
BEGIN
  IF NEW.max_guests IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vt.capacity
  INTO v_venue_capacity
  FROM public.venue_tables AS vt
  WHERE vt.id = NEW.table_id;

  IF v_venue_capacity IS NULL THEN
    RAISE EXCEPTION 'event_tables.table_id % not found in venue_tables', NEW.table_id;
  END IF;

  IF NEW.max_guests > v_venue_capacity THEN
    RAISE EXCEPTION
      'event_tables.max_guests (%) exceeds venue_tables.capacity (%) for table %',
      NEW.max_guests, v_venue_capacity, NEW.table_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_tables_max_guests_within_venue_capacity
  BEFORE INSERT OR UPDATE OF max_guests, table_id ON public.event_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_event_tables_max_guests_within_venue_capacity();

-- ---------------------------------------------------------------------------
-- 2. table_reservations.collection_type (D11-C, E2)
-- ---------------------------------------------------------------------------

ALTER TABLE public.table_reservations
  ADD COLUMN collection_type text NULL;

ALTER TABLE public.table_reservations
  ADD CONSTRAINT table_reservations_collection_type_check CHECK (
    collection_type IS NULL
    OR collection_type IN ('online', 'venue_collected', 'complimentary')
  );

CREATE INDEX table_reservations_collection_type_idx
  ON public.table_reservations (collection_type)
  WHERE collection_type IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. event_resource_blocks.operation_reason (D11-A)
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_resource_blocks
  ADD COLUMN operation_reason text NULL;

ALTER TABLE public.event_resource_blocks
  ADD CONSTRAINT event_resource_blocks_operation_reason_check CHECK (
    operation_reason IS NULL
    OR operation_reason IN (
      'field_reservation',
      'venue_guest',
      'organization_reservation',
      'vip_hold',
      'temporary_hold',
      'out_of_service'
    )
  );

CREATE INDEX event_resource_blocks_event_operation_reason_active_idx
  ON public.event_resource_blocks (event_id, operation_reason)
  WHERE is_active = true AND operation_reason IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. event_resource_blocks resource_type zone (D11-D)
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_resource_blocks
  DROP CONSTRAINT event_resource_blocks_resource_type_check;

ALTER TABLE public.event_resource_blocks
  ADD CONSTRAINT event_resource_blocks_resource_type_check CHECK (
    resource_type IN ('table', 'seat', 'zone')
  );

CREATE OR REPLACE FUNCTION public.trg_resource_block_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_venue_id uuid;
  v_resource_venue_id uuid;
BEGIN
  SELECT e.venue_id
  INTO v_event_venue_id
  FROM public.events AS e
  WHERE e.id = NEW.event_id;

  IF v_event_venue_id IS NULL THEN
    RAISE EXCEPTION 'event_resource_blocks.event_id % does not exist', NEW.event_id;
  END IF;

  IF NEW.resource_type = 'table' THEN
    SELECT vt.venue_id
    INTO v_resource_venue_id
    FROM public.venue_tables AS vt
    WHERE vt.id = NEW.resource_id;
  ELSIF NEW.resource_type = 'seat' THEN
    SELECT vs.venue_id
    INTO v_resource_venue_id
    FROM public.venue_seats AS vs
    WHERE vs.id = NEW.resource_id;
  ELSIF NEW.resource_type = 'zone' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.event_ticket_zones AS etz
      WHERE etz.id = NEW.resource_id
        AND etz.event_id = NEW.event_id
    ) THEN
      RAISE EXCEPTION
        'event_resource_blocks resource_id % not found for resource_type zone in event %',
        NEW.resource_id, NEW.event_id;
    END IF;

    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'event_resource_blocks.resource_type % is not supported', NEW.resource_type;
  END IF;

  IF v_resource_venue_id IS NULL THEN
    RAISE EXCEPTION
      'event_resource_blocks resource_id % not found for resource_type %',
      NEW.resource_id, NEW.resource_type;
  END IF;

  IF v_resource_venue_id IS DISTINCT FROM v_event_venue_id THEN
    RAISE EXCEPTION
      'event_resource_blocks venue mismatch: resource % (venue %) is not in event % (venue %)',
      NEW.resource_id, v_resource_venue_id, NEW.event_id, v_event_venue_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. qr_codes_entity_active_unique revision (M8 multi-pass)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.qr_codes_entity_active_unique;

CREATE UNIQUE INDEX qr_codes_entity_active_unique
  ON public.qr_codes (entity_type, entity_id)
  WHERE status = 'active'
    AND entity_type IN (
      'ticket',
      'table_reservation',
      'seat_reservation',
      'hotel_internal'
    );

-- ---------------------------------------------------------------------------
-- 6. entry_passes schema hardening (E5, D4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_guard_entry_passes_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'active' THEN
      PERFORM public.trg_assert_allowed_transition(
        'entry_pass', OLD.status, NEW.status, ARRAY['used', 'revoked']
      );
    ELSE
      RAISE EXCEPTION
        'Invalid entry_pass status transition: % → % (terminal state)',
        OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_entry_passes_status
  BEFORE UPDATE OF status ON public.entry_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_entry_passes_status();

CREATE OR REPLACE FUNCTION public.trg_entry_passes_parent_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_type = 'table_reservation' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.table_reservations AS tr
      WHERE tr.id = NEW.parent_id
    ) THEN
      RAISE EXCEPTION
        'entry_passes parent_id % not found in table_reservations',
        NEW.parent_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'entry_passes.parent_type % is not supported', NEW.parent_type;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entry_passes_parent_valid
  BEFORE INSERT OR UPDATE OF parent_type, parent_id ON public.entry_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_entry_passes_parent_valid();

-- ---------------------------------------------------------------------------
-- 7. RLS — event_sale_categories + entry_passes (037 gap fix)
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_sale_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_passes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.event_sale_categories TO anon, authenticated;
GRANT SELECT ON public.entry_passes TO authenticated;

CREATE POLICY event_sale_categories_select_public
  ON public.event_sale_categories
  FOR SELECT TO anon, authenticated
  USING (
    public.event_is_published(event_id)
    OR public.can_manage_event(event_id)
  );

CREATE POLICY entry_passes_select_own
  ON public.entry_passes
  FOR SELECT TO authenticated
  USING (
    holder_id = auth.uid()
    OR public.is_super_admin()
    OR public.can_scan_event(event_id)
    OR public.can_settle_event(event_id)
    OR (
      parent_type = 'table_reservation'
      AND EXISTS (
        SELECT 1
        FROM public.table_reservations AS tr
        WHERE tr.id = entry_passes.parent_id
          AND tr.customer_id = auth.uid()
      )
    )
  );

-- Extend qr_codes read for entry_pass token sharing (D6); preserves 034 access paths.
DROP POLICY IF EXISTS qr_codes_select_own ON public.qr_codes;

CREATE POLICY qr_codes_select_own ON public.qr_codes
  FOR SELECT TO authenticated
  USING (
    holder_id = auth.uid()
    OR public.is_super_admin()
    OR public.can_scan_event(event_id)
    OR EXISTS (
      SELECT 1
      FROM public.entry_passes AS ep
      WHERE ep.qr_code_id = qr_codes.id
        AND (
          ep.holder_id = auth.uid()
          OR (
            ep.parent_type = 'table_reservation'
            AND EXISTS (
              SELECT 1
              FROM public.table_reservations AS tr
              WHERE tr.id = ep.parent_id
                AND tr.customer_id = auth.uid()
            )
          )
        )
    )
  );
