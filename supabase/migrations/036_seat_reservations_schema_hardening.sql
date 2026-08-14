-- Migration 036 — seat_reservations schema hardening (decision 033-M7)
-- Scope: public.seat_reservations only — default, nullability, foreign keys.
-- Migrations 023 / 033 / 034 are not modified.

-- ---------------------------------------------------------------------------
-- status — default before NOT NULL, so a write without status keeps working
-- while this migration runs
-- ---------------------------------------------------------------------------

ALTER TABLE public.seat_reservations
  ALTER COLUMN status SET DEFAULT 'pending_payment';

ALTER TABLE public.seat_reservations
  ALTER COLUMN status SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Nullability — makes the (event_id, seat_id) partial unique index effective,
-- since NULL values never conflict in a unique index. It also makes the NULL
-- early-exit in trg_seat_reservation_chain (033) unreachable: the
-- event_seat_pricing check now runs for every row.
-- ---------------------------------------------------------------------------

ALTER TABLE public.seat_reservations
  ALTER COLUMN event_id SET NOT NULL;

ALTER TABLE public.seat_reservations
  ALTER COLUMN order_id SET NOT NULL;

ALTER TABLE public.seat_reservations
  ALTER COLUMN seat_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Foreign keys — ON DELETE is left unspecified to match tickets and
-- table_reservations. The seat_id target is not named in the source documents;
-- venue_seats is the target chosen by decision 033-M7.
-- ---------------------------------------------------------------------------

ALTER TABLE public.seat_reservations
  ADD CONSTRAINT seat_reservations_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id);

ALTER TABLE public.seat_reservations
  ADD CONSTRAINT seat_reservations_seat_id_fkey
  FOREIGN KEY (seat_id) REFERENCES public.venue_seats (id);
