-- FAZ 0 v1.4.1 — Migration 015: event_seat_pricing
-- Zone mode, cross-validation (033); RLS, RPC, indexes: later migrations

CREATE TABLE public.event_seat_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  seat_id uuid NOT NULL REFERENCES public.venue_seats (id),
  zone_id uuid NOT NULL REFERENCES public.event_ticket_zones (id),
  price numeric(12, 2) NOT NULL,
  deposit_amount numeric(12, 2) NULL,
  is_sellable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_seat_pricing_event_id_seat_id_unique UNIQUE (event_id, seat_id)
);
