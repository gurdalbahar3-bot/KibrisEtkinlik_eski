-- FAZ 0 v1.4.1 — Migration 003: profiles + system_settings.updated_by FK
-- Role profiles (004), RLS, triggers, indexes: later migrations

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text NULL,
  full_name text NULL,
  account_type text NOT NULL,
  verification_status text NOT NULL DEFAULT 'not_required',
  avatar_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_account_type_check CHECK (
    account_type IN ('customer', 'venue_owner', 'organizer')
  ),
  CONSTRAINT profiles_verification_status_check CHECK (
    verification_status IN ('pending', 'approved', 'rejected', 'not_required')
  ),
  CONSTRAINT profiles_email_unique UNIQUE (email)
);

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.profiles (id) ON DELETE SET NULL;
