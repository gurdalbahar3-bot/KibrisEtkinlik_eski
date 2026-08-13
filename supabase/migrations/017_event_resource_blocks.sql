-- FAZ 0 v1.4.1 — Migration 017: event_resource_blocks
-- Polymorphic venue validation (033); partial unique, RLS, RPC, indexes: later migrations

CREATE TABLE public.event_resource_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  block_type text NOT NULL,
  reason text NULL,
  blocked_by uuid NOT NULL REFERENCES public.profiles (id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_resource_blocks_resource_type_check CHECK (
    resource_type IN ('table', 'seat')
  ),
  CONSTRAINT event_resource_blocks_block_type_check CHECK (
    block_type IN (
      'protocol',
      'vip_guest',
      'technical',
      'out_of_service',
      'business_use'
    )
  )
);
