-- FAZ 0 v1.4.1 — Migration 004: role profile tables
-- RLS, triggers, indexes: later migrations

CREATE TABLE public.customer_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  preferred_city text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.venue_owner_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  business_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organizer_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
