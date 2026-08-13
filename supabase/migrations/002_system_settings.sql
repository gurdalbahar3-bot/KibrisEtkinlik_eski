-- FAZ 0 v1.4.1 — Migration 002: system_settings
-- FK (updated_by → profiles), RLS, seed: later migrations

CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);
