-- FAZ 0 v1.4.1 — Migration 019: wedding_details
-- Wedding business rules (033/034); RLS, indexes: later migrations

CREATE TABLE public.wedding_details (
  event_id uuid PRIMARY KEY REFERENCES public.events (id),
  bride_name text NOT NULL,
  groom_name text NOT NULL,
  calendar_export_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
