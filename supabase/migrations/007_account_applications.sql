-- FAZ 0 v1.4.1 — Migration 007: account_applications
-- RLS, triggers, indexes: later migrations

CREATE TABLE public.account_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.profiles (id),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles (id),
  reviewed_at timestamptz NULL,
  rejection_reason text NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_applications_type_check CHECK (
    type IN ('venue_owner', 'organizer')
  ),
  CONSTRAINT account_applications_status_check CHECK (
    status IN ('pending', 'under_review', 'approved', 'rejected')
  )
);
