-- FAZ 0 v1.4.1 — Migration 016: event_tables
-- Venue match validation (033); RLS, RPC, indexes: later migrations

CREATE TABLE public.event_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  table_id uuid NOT NULL REFERENCES public.venue_tables (id),
  is_sellable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_tables_event_id_table_id_unique UNIQUE (event_id, table_id)
);
