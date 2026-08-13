-- FAZ 0 v1.4.1 — Migration 006: super_admin_profiles
-- RLS, triggers, indexes: later migrations

CREATE TABLE public.super_admin_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.profiles (id)
);
