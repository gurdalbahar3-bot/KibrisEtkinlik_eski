-- FAZ 0 v1.4.1 — Migration 013: event_artists
-- RLS, triggers, indexes: later migrations

CREATE TABLE public.event_artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  artist_id uuid NOT NULL REFERENCES public.artists (id),
  role text NULL DEFAULT 'performer',
  sort_order int NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_artists_event_id_artist_id_unique UNIQUE (event_id, artist_id)
);
