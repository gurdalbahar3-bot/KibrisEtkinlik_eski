-- FAZ 0 v1.4.1 — Migration 010: artists
-- event_artists (013); RLS, triggers, indexes: later migrations

CREATE TABLE public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  bio text NULL,
  image_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artists_slug_unique UNIQUE (slug)
);
