-- Migration 035 — seat_reservations state machine (decisions 033-M6, 033-M6-B)
-- FAZ 0 v1.3 FINAL LOCKED SPEC — §6.4 Table / Seat Reservation
-- Scope: status CHECK + trg_guard_seat_reservations_status() only.
-- expire_order_atomic / fail_payment_atomic (migration 034) stay unchanged.

-- ---------------------------------------------------------------------------
-- status CHECK — add 'cancelled_by_organizer', keep 'cancelled'
-- ---------------------------------------------------------------------------

-- Both cancellation literals coexist by decision 033-M6-B: 'cancelled' is
-- system-sourced (order expiry, payment failure), 'cancelled_by_organizer' is
-- organizer-sourced.
ALTER TABLE public.seat_reservations
  DROP CONSTRAINT seat_reservations_status_check;

ALTER TABLE public.seat_reservations
  ADD CONSTRAINT seat_reservations_status_check CHECK (
    status IN (
      'pending_payment',
      'confirmed',
      'transferred',
      'used',
      'cancelled',
      'cancelled_by_organizer'
    )
  );

-- ---------------------------------------------------------------------------
-- §6.4 state transition guard (replaces the migration 033 definition)
-- ---------------------------------------------------------------------------

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
      PERFORM public.trg_assert_allowed_transition('seat_reservation', OLD.status, NEW.status, ARRAY['confirmed', 'cancelled', 'cancelled_by_organizer']);
    WHEN 'confirmed' THEN
      PERFORM public.trg_assert_allowed_transition('seat_reservation', OLD.status, NEW.status, ARRAY['used', 'transferred', 'cancelled_by_organizer']);
    ELSE
      RAISE EXCEPTION 'Invalid seat_reservation status transition: % → % (terminal state)', OLD.status, NEW.status;
  END CASE;

  RETURN NEW;
END;
$$;
