-- FAZ 0 v1.4.1 — Migration 008: venues and venue_areas
-- venue_tables, venue_seats (009); RLS, triggers, indexes: later migrations

CREATE TABLE public.venues (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles (id),
  name text NOT NULL,
  venue_category text NULL,
  address text NULL,
  city text NULL,
  region text NULL,
  latitude numeric NULL,
  longitude numeric NULL,
  capacity int NULL,
  floor_plan_url text NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venues_venue_category_check CHECK (
    venue_category IN ('hotel', 'restaurant', 'club', 'theater', 'other')
  ),
  CONSTRAINT venues_status_check CHECK (
    status IN ('active', 'inactive')
  )
);

CREATE TABLE public.venue_areas (
  id uuid PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues (id),
  name text NOT NULL,
  area_type text NULL,
  capacity int NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_areas_area_type_check CHECK (
    area_type IN ('hall', 'stage', 'entrance', 'vip', 'standard', 'other')
  )
);
