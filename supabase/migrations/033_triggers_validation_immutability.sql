-- Migration 033 — triggers: validation, immutability, auth→profiles, state guards
-- FAZ 0 v1.3 FINAL LOCKED SPEC — §6 state machines, §10 cross-event/venue validation
-- RLS, RPC, indexes: migration 034
-- Deploy: NOT APPLIED (prepared for review)

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable: % operations are not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_assert_allowed_transition(
  p_entity text,
  p_from text,
  p_to text,
  p_allowed text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_from = p_to THEN
    RETURN;
  END IF;

  IF p_to = ANY (p_allowed) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid % status transition: % → %', p_entity, p_from, p_to;
END;
$$;

-- ---------------------------------------------------------------------------
-- §10 Cross-event / cross-venue validation (BEFORE INSERT OR UPDATE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_ticket_type_same_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_zone_event_id uuid;
BEGIN
  SELECT z.event_id
  INTO v_zone_event_id
  FROM public.event_ticket_zones AS z
  WHERE z.id = NEW.zone_id;

  IF v_zone_event_id IS NULL THEN
    RAISE EXCEPTION 'event_ticket_types.zone_id % does not exist', NEW.zone_id;
  END IF;

  IF v_zone_event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION
      'event_ticket_types event mismatch: zone % belongs to event %, not %',
      NEW.zone_id, v_zone_event_id, NEW.event_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_type_same_event
  BEFORE INSERT OR UPDATE ON public.event_ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ticket_type_same_event();

CREATE OR REPLACE FUNCTION public.trg_validate_ticket_type_zone_mode()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_mode text;
BEGIN
  SELECT z.sale_mode
  INTO v_sale_mode
  FROM public.event_ticket_zones AS z
  WHERE z.id = NEW.zone_id;

  IF v_sale_mode IS NULL THEN
    RAISE EXCEPTION 'event_ticket_types.zone_id % does not exist', NEW.zone_id;
  END IF;

  IF v_sale_mode <> 'ticket_based' THEN
    RAISE EXCEPTION
      'event_ticket_types require ticket_based zone; zone % has sale_mode %',
      NEW.zone_id, v_sale_mode;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ticket_type_zone_mode
  BEFORE INSERT OR UPDATE ON public.event_ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_ticket_type_zone_mode();

CREATE OR REPLACE FUNCTION public.trg_seat_pricing_venue_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_venue_id uuid;
  v_seat_venue_id uuid;
BEGIN
  SELECT e.venue_id
  INTO v_event_venue_id
  FROM public.events AS e
  WHERE e.id = NEW.event_id;

  IF v_event_venue_id IS NULL THEN
    RAISE EXCEPTION 'event_seat_pricing.event_id % does not exist', NEW.event_id;
  END IF;

  SELECT s.venue_id
  INTO v_seat_venue_id
  FROM public.venue_seats AS s
  WHERE s.id = NEW.seat_id;

  IF v_seat_venue_id IS NULL THEN
    RAISE EXCEPTION 'event_seat_pricing.seat_id % does not exist', NEW.seat_id;
  END IF;

  IF v_seat_venue_id IS DISTINCT FROM v_event_venue_id THEN
    RAISE EXCEPTION
      'event_seat_pricing venue mismatch: seat % (venue %) is not in event % (venue %)',
      NEW.seat_id, v_seat_venue_id, NEW.event_id, v_event_venue_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seat_pricing_venue_match
  BEFORE INSERT OR UPDATE ON public.event_seat_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seat_pricing_venue_match();

CREATE OR REPLACE FUNCTION public.trg_seat_pricing_zone_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_zone_event_id uuid;
BEGIN
  SELECT z.event_id
  INTO v_zone_event_id
  FROM public.event_ticket_zones AS z
  WHERE z.id = NEW.zone_id;

  IF v_zone_event_id IS NULL THEN
    RAISE EXCEPTION 'event_seat_pricing.zone_id % does not exist', NEW.zone_id;
  END IF;

  IF v_zone_event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION
      'event_seat_pricing zone/event mismatch: zone % belongs to event %, not %',
      NEW.zone_id, v_zone_event_id, NEW.event_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seat_pricing_zone_event
  BEFORE INSERT OR UPDATE ON public.event_seat_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seat_pricing_zone_event();

CREATE OR REPLACE FUNCTION public.trg_validate_seat_pricing_zone_mode()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_mode text;
BEGIN
  SELECT z.sale_mode
  INTO v_sale_mode
  FROM public.event_ticket_zones AS z
  WHERE z.id = NEW.zone_id;

  IF v_sale_mode IS NULL THEN
    RAISE EXCEPTION 'event_seat_pricing.zone_id % does not exist', NEW.zone_id;
  END IF;

  IF v_sale_mode <> 'seat_based' THEN
    RAISE EXCEPTION
      'event_seat_pricing require seat_based zone; zone % has sale_mode %',
      NEW.zone_id, v_sale_mode;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_seat_pricing_zone_mode
  BEFORE INSERT OR UPDATE ON public.event_seat_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_seat_pricing_zone_mode();

CREATE OR REPLACE FUNCTION public.trg_event_tables_venue_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_venue_id uuid;
  v_table_venue_id uuid;
BEGIN
  SELECT e.venue_id
  INTO v_event_venue_id
  FROM public.events AS e
  WHERE e.id = NEW.event_id;

  IF v_event_venue_id IS NULL THEN
    RAISE EXCEPTION 'event_tables.event_id % does not exist', NEW.event_id;
  END IF;

  SELECT t.venue_id
  INTO v_table_venue_id
  FROM public.venue_tables AS t
  WHERE t.id = NEW.table_id;

  IF v_table_venue_id IS NULL THEN
    RAISE EXCEPTION 'event_tables.table_id % does not exist', NEW.table_id;
  END IF;

  IF v_table_venue_id IS DISTINCT FROM v_event_venue_id THEN
    RAISE EXCEPTION
      'event_tables venue mismatch: table % (venue %) is not in event % (venue %)',
      NEW.table_id, v_table_venue_id, NEW.event_id, v_event_venue_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_tables_venue_match
  BEFORE INSERT OR UPDATE ON public.event_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_event_tables_venue_match();

CREATE OR REPLACE FUNCTION public.trg_table_package_same_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_table_event_id uuid;
BEGIN
  SELECT et.event_id
  INTO v_event_table_event_id
  FROM public.event_tables AS et
  WHERE et.id = NEW.event_table_id;

  IF v_event_table_event_id IS NULL THEN
    RAISE EXCEPTION 'table_packages.event_table_id % does not exist', NEW.event_table_id;
  END IF;

  IF v_event_table_event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION
      'table_packages event mismatch: event_table % belongs to event %, not %',
      NEW.event_table_id, v_event_table_event_id, NEW.event_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_table_package_same_event
  BEFORE INSERT OR UPDATE ON public.table_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_table_package_same_event();

CREATE OR REPLACE FUNCTION public.trg_table_reservation_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.events AS e
    JOIN public.event_tables AS et
      ON et.id = NEW.event_table_id
     AND et.event_id = NEW.event_id
     AND et.table_id = NEW.table_id
    JOIN public.venue_tables AS vt
      ON vt.id = NEW.table_id
     AND vt.venue_id = e.venue_id
    JOIN public.table_packages AS tp
      ON tp.id = NEW.package_id
     AND tp.event_id = NEW.event_id
     AND tp.event_table_id = NEW.event_table_id
    WHERE e.id = NEW.event_id
  ) THEN
    RAISE EXCEPTION
      'table_reservations chain invalid for event %, table %, event_table %, package %',
      NEW.event_id, NEW.table_id, NEW.event_table_id, NEW.package_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_table_reservation_chain
  BEFORE INSERT OR UPDATE ON public.table_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_table_reservation_chain();

CREATE OR REPLACE FUNCTION public.trg_seat_reservation_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_id IS NULL OR NEW.seat_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.event_seat_pricing AS esp
    WHERE esp.event_id = NEW.event_id
      AND esp.seat_id = NEW.seat_id
  ) THEN
    RAISE EXCEPTION
      'seat_reservations chain invalid: no event_seat_pricing for event % and seat %',
      NEW.event_id, NEW.seat_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seat_reservation_chain
  BEFORE INSERT OR UPDATE ON public.seat_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seat_reservation_chain();

CREATE OR REPLACE FUNCTION public.trg_ticket_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.event_ticket_types AS ett
    JOIN public.event_ticket_zones AS etz
      ON etz.id = NEW.zone_id
     AND ett.id = NEW.ticket_type_id
     AND ett.event_id = NEW.event_id
     AND etz.event_id = NEW.event_id
     AND ett.zone_id = etz.id
  ) THEN
    RAISE EXCEPTION
      'tickets chain invalid for event %, ticket_type %, zone %',
      NEW.event_id, NEW.ticket_type_id, NEW.zone_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_chain
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ticket_chain();

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

CREATE TRIGGER trg_resource_block_valid
  BEFORE INSERT OR UPDATE ON public.event_resource_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_resource_block_valid();

-- seat_based zones must not use ticket-based counters (spec §10)
CREATE OR REPLACE FUNCTION public.trg_guard_seat_based_zone_counters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sale_mode = 'seat_based'
     AND (NEW.reserved_count <> 0 OR NEW.sold_count <> 0) THEN
    RAISE EXCEPTION
      'seat_based zone % must keep reserved_count and sold_count at 0 (got reserved=%, sold=%)',
      NEW.id, NEW.reserved_count, NEW.sold_count;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_seat_based_zone_counters
  BEFORE INSERT OR UPDATE ON public.event_ticket_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_seat_based_zone_counters();

-- ---------------------------------------------------------------------------
-- Immutability (spec §8.2 — payment_line_items; audit_logs; reservation_transfers)
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_payment_line_items_immutable
  BEFORE UPDATE OR DELETE ON public.payment_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_immutable_row();

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_immutable_row();

CREATE TRIGGER trg_reservation_transfers_immutable
  BEFORE UPDATE OR DELETE ON public.reservation_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_immutable_row();

-- ---------------------------------------------------------------------------
-- Auth → profiles (migration 003)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_type text;
BEGIN
  v_account_type := COALESCE(NEW.raw_user_meta_data ->> 'account_type', 'customer');

  IF v_account_type NOT IN ('customer', 'venue_owner', 'organizer') THEN
    v_account_type := 'customer';
  END IF;

  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'Email is required to create a profile';
  END IF;

  INSERT INTO public.profiles (id, email, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    v_account_type
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- §6 State transition guards (BEFORE UPDATE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_guard_events_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status::text
    WHEN 'draft' THEN
      PERFORM public.trg_assert_allowed_transition('event', OLD.status::text, NEW.status::text, ARRAY['published']);
    WHEN 'published' THEN
      PERFORM public.trg_assert_allowed_transition('event', OLD.status::text, NEW.status::text, ARRAY['postponed', 'cancelled', 'completed']);
    WHEN 'postponed' THEN
      PERFORM public.trg_assert_allowed_transition('event', OLD.status::text, NEW.status::text, ARRAY['published', 'cancelled', 'completed']);
    ELSE
      RAISE EXCEPTION 'Invalid event status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_events_status
  BEFORE UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_events_status();

CREATE OR REPLACE FUNCTION public.trg_guard_orders_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'expired' AND NEW.status = 'paid' THEN
    RAISE EXCEPTION 'Invalid order status transition: expired → paid is forbidden';
  END IF;

  CASE OLD.status
    WHEN 'draft' THEN
      PERFORM public.trg_assert_allowed_transition('order', OLD.status, NEW.status, ARRAY['pending_payment']);
    WHEN 'pending_payment' THEN
      PERFORM public.trg_assert_allowed_transition('order', OLD.status, NEW.status, ARRAY['paid', 'failed', 'expired', 'cancelled_by_organizer']);
    ELSE
      RAISE EXCEPTION 'Invalid order status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_orders_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_orders_status();

CREATE OR REPLACE FUNCTION public.trg_guard_tickets_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending_payment' THEN
      PERFORM public.trg_assert_allowed_transition('ticket', OLD.status, NEW.status, ARRAY['active', 'cancelled_by_organizer']);
    WHEN 'active' THEN
      PERFORM public.trg_assert_allowed_transition('ticket', OLD.status, NEW.status, ARRAY['used', 'transferred', 'cancelled_by_organizer']);
    ELSE
      RAISE EXCEPTION 'Invalid ticket status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_tickets_status
  BEFORE UPDATE OF status ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_tickets_status();

CREATE OR REPLACE FUNCTION public.trg_guard_table_reservations_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending_payment' THEN
      PERFORM public.trg_assert_allowed_transition('table_reservation', OLD.status, NEW.status, ARRAY['confirmed', 'cancelled_by_organizer']);
    WHEN 'confirmed' THEN
      PERFORM public.trg_assert_allowed_transition('table_reservation', OLD.status, NEW.status, ARRAY['used', 'transferred', 'cancelled_by_organizer']);
    ELSE
      RAISE EXCEPTION 'Invalid table_reservation status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_table_reservations_status
  BEFORE UPDATE OF status ON public.table_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_table_reservations_status();

CREATE OR REPLACE FUNCTION public.trg_guard_table_reservations_financial_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.financial_status = NEW.financial_status THEN
    RETURN NEW;
  END IF;

  CASE OLD.financial_status
    WHEN 'pending_payment' THEN
      PERFORM public.trg_assert_allowed_transition('table_reservation.financial_status', OLD.financial_status, NEW.financial_status, ARRAY['online_paid']);
    WHEN 'online_paid' THEN
      PERFORM public.trg_assert_allowed_transition('table_reservation.financial_status', OLD.financial_status, NEW.financial_status, ARRAY['partially_collected_at_venue']);
    WHEN 'partially_collected_at_venue' THEN
      PERFORM public.trg_assert_allowed_transition('table_reservation.financial_status', OLD.financial_status, NEW.financial_status, ARRAY['venue_balance_settled']);
    ELSE
      RAISE EXCEPTION 'Invalid table_reservation financial_status transition: % → % (terminal state)', OLD.financial_status, NEW.financial_status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_table_reservations_financial_status
  BEFORE UPDATE OF financial_status ON public.table_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_table_reservations_financial_status();

CREATE OR REPLACE FUNCTION public.trg_guard_seat_reservations_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending_payment' THEN
      PERFORM public.trg_assert_allowed_transition('seat_reservation', OLD.status, NEW.status, ARRAY['confirmed', 'cancelled']);
    WHEN 'confirmed' THEN
      PERFORM public.trg_assert_allowed_transition('seat_reservation', OLD.status, NEW.status, ARRAY['used', 'transferred']);
    ELSE
      RAISE EXCEPTION 'Invalid seat_reservation status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_seat_reservations_status
  BEFORE UPDATE OF status ON public.seat_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_seat_reservations_status();

CREATE OR REPLACE FUNCTION public.trg_guard_qr_codes_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'active' THEN
      PERFORM public.trg_assert_allowed_transition('qr_code', OLD.status, NEW.status, ARRAY['used', 'revoked']);
    ELSE
      RAISE EXCEPTION 'Invalid qr_code status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_qr_codes_status
  BEFORE UPDATE OF status ON public.qr_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_qr_codes_status();
