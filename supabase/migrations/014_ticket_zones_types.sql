-- FAZ 0 v1.4.1 — Migration 014: event_ticket_zones, event_ticket_types
-- seat_based zone guard, cross-table validation (033); RLS, RPC, indexes: later migrations

CREATE TABLE public.event_ticket_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  name text NOT NULL,
  zone_type text NOT NULL,
  sale_mode text NOT NULL,
  venue_area_id uuid NULL REFERENCES public.venue_areas (id),
  capacity int NOT NULL,
  reserved_count int NOT NULL DEFAULT 0,
  sold_count int NOT NULL DEFAULT 0,
  description text NULL,
  sort_order int NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ticket_zones_event_id_name_unique UNIQUE (event_id, name),
  CONSTRAINT event_ticket_zones_zone_type_check CHECK (
    zone_type IN ('standard', 'front_row', 'vip', 'other')
  ),
  CONSTRAINT event_ticket_zones_sale_mode_check CHECK (
    sale_mode IN ('ticket_based', 'seat_based')
  ),
  CONSTRAINT event_ticket_zones_ticket_based_capacity_check CHECK (
    sale_mode <> 'ticket_based' OR sold_count + reserved_count <= capacity
  )
);

CREATE TABLE public.event_ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  zone_id uuid NOT NULL REFERENCES public.event_ticket_zones (id),
  name text NOT NULL,
  price numeric(12, 2) NOT NULL,
  description text NULL,
  max_per_order int NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ticket_types_event_id_zone_id_name_unique UNIQUE (event_id, zone_id, name)
);
