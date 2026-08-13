-- FAZ 0 v1.4.1 — Migration 009: venue_tables and venue_seats
-- event_tables, event_seat_pricing (later); RLS, triggers, indexes: later migrations

CREATE TABLE public.venue_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  area_id uuid NULL REFERENCES public.venue_areas (id) ON DELETE CASCADE,
  table_number text NOT NULL,
  capacity int NOT NULL,
  table_type text NULL,
  position_x numeric NULL,
  position_y numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_tables_venue_id_table_number_unique UNIQUE (venue_id, table_number),
  CONSTRAINT venue_tables_table_type_check CHECK (
    table_type IN ('vip', 'standard', 'other')
  )
);

CREATE TABLE public.venue_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  area_id uuid NULL REFERENCES public.venue_areas (id) ON DELETE CASCADE,
  section text NULL,
  row_label text NULL,
  seat_number text NOT NULL,
  seat_type text NULL,
  position_x numeric NULL,
  position_y numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_seats_venue_id_section_row_label_seat_number_unique UNIQUE (
    venue_id,
    section,
    row_label,
    seat_number
  ),
  CONSTRAINT venue_seats_seat_type_check CHECK (
    seat_type IN ('vip', 'standard', 'other')
  )
);
