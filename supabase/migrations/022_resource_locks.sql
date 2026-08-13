-- FAZ 0 v1.4.1 — Migration 022: resource_locks
-- Partial unique, indexes, RLS, RPC: later migrations

CREATE TABLE public.resource_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  locked_by_user_id uuid NOT NULL REFERENCES public.profiles (id),
  order_id uuid NULL REFERENCES public.orders (id),
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT resource_locks_resource_type_check CHECK (
    resource_type IN ('table', 'seat')
  ),
  CONSTRAINT resource_locks_status_check CHECK (
    status IN ('active', 'released', 'converted', 'expired')
  )
);
