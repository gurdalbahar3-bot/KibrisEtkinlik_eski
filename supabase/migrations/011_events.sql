-- FAZ 0 v1.4.1 — Migration 011: events
-- event_formats, contacts, locations (012); RLS, triggers, indexes: later migrations

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id),
  venue_id uuid NOT NULL REFERENCES public.venues (id),
  title text NOT NULL,
  description text NULL,
  category text NOT NULL,
  is_free boolean NOT NULL DEFAULT false,
  is_wedding boolean NOT NULL DEFAULT false,
  status public.event_status NOT NULL DEFAULT 'draft',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NULL,
  cover_image_url text NULL,
  cancellation_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
