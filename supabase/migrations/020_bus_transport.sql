-- FAZ 0 v1.4.1 — Migration 020: bus_routes, bus_stops, bus_return_times
-- RLS, indexes: later migrations

CREATE TABLE public.bus_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bus_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.bus_routes (id) ON DELETE CASCADE,
  stop_name text NOT NULL,
  departure_time time NOT NULL,
  latitude numeric NULL,
  longitude numeric NULL,
  sort_order int NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bus_stops_route_id_stop_name_departure_time_unique UNIQUE (route_id, stop_name, departure_time)
);

CREATE TABLE public.bus_return_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.bus_routes (id) ON DELETE CASCADE,
  return_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
