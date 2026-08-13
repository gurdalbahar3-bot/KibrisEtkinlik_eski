-- FAZ 0 v1.4.1 — Migration 012: event_formats, event_venue_contacts, event_locations
-- event_schedule_changes (deferred); RLS, triggers, indexes: later migrations

CREATE TABLE public.event_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  format_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_formats_event_id_format_type_unique UNIQUE (event_id, format_type),
  CONSTRAINT event_formats_format_type_check CHECK (
    format_type IN ('general_admission', 'seated', 'table_reservation')
  )
);

CREATE TABLE public.event_venue_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events (id),
  venue_id uuid NOT NULL REFERENCES public.venues (id),
  venue_name text NOT NULL,
  contact_full_name text NOT NULL,
  contact_phone text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending',
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.event_locations (
  event_id uuid PRIMARY KEY REFERENCES public.events (id),
  address text NULL,
  city text NULL,
  region text NULL,
  latitude numeric NULL,
  longitude numeric NULL,
  directions_text text NULL
);
