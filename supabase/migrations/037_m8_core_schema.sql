-- Migration 037 — M8 core schema (decisions 033-M8 D1–D10, D11, E1–E5)
-- Scope: ADDITIVE DDL only — no RPC, no event_resource_blocks, no behavior change.
-- Migrations 035 / 036 are not modified.
-- NOTE: max_guests venue-capacity trigger deferred to migration 038.

-- ---------------------------------------------------------------------------
-- 1. event_sale_categories (D1, D3, D10)
-- ---------------------------------------------------------------------------

CREATE TABLE public.event_sale_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  category text NOT NULL,
  fulfillment_mode text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_sale_categories_event_id_category_fulfillment_mode_unique
    UNIQUE (event_id, category, fulfillment_mode),

  CONSTRAINT event_sale_categories_category_check CHECK (
    category IN ('general_admission', 'table', 'bistro', 'vip')
  ),

  CONSTRAINT event_sale_categories_fulfillment_mode_check CHECK (
    fulfillment_mode IN ('ticket', 'seat', 'table')
  ),

  CONSTRAINT event_sale_categories_category_fulfillment_mapping_check CHECK (
    (category = 'general_admission' AND fulfillment_mode = 'ticket')
    OR (category = 'table' AND fulfillment_mode = 'table')
    OR (category = 'bistro' AND fulfillment_mode = 'table')
    OR (category = 'vip' AND fulfillment_mode IN ('ticket', 'seat', 'table'))
  )
);

CREATE INDEX event_sale_categories_event_id_idx
  ON public.event_sale_categories (event_id);

CREATE INDEX event_sale_categories_event_enabled_idx
  ON public.event_sale_categories (event_id)
  WHERE is_enabled = true;

-- ---------------------------------------------------------------------------
-- 2. event_tables.max_guests (D8, E1) — column + local CHECK only
-- Venue capacity cross-table validation: migration 038
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_tables
  ADD COLUMN max_guests integer NULL;

ALTER TABLE public.event_tables
  ADD CONSTRAINT event_tables_max_guests_positive_check CHECK (
    max_guests IS NULL OR max_guests > 0
  );

-- ---------------------------------------------------------------------------
-- 3. table_packages.sale_category (D2)
-- ---------------------------------------------------------------------------

ALTER TABLE public.table_packages
  ADD COLUMN sale_category text NOT NULL DEFAULT 'table';

ALTER TABLE public.table_packages
  ADD CONSTRAINT table_packages_sale_category_check CHECK (
    sale_category IN ('table', 'bistro', 'vip')
  );

-- ---------------------------------------------------------------------------
-- 4. entry_passes (D4, D5, D6, D7, E3, E5)
-- M8 faz 1: parent_type = table_reservation only
-- ---------------------------------------------------------------------------

CREATE TABLE public.entry_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text NOT NULL,
  parent_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events (id),
  holder_id uuid NULL REFERENCES public.profiles (id),
  status text NOT NULL DEFAULT 'active',
  qr_code_id uuid NOT NULL REFERENCES public.qr_codes (id),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entry_passes_parent_type_check CHECK (
    parent_type IN ('table_reservation')
  ),

  CONSTRAINT entry_passes_status_check CHECK (
    status IN ('active', 'used', 'revoked')
  ),

  CONSTRAINT entry_passes_qr_code_id_unique UNIQUE (qr_code_id)
);

CREATE INDEX entry_passes_parent_idx
  ON public.entry_passes (parent_type, parent_id);

CREATE INDEX entry_passes_parent_active_idx
  ON public.entry_passes (parent_type, parent_id)
  WHERE status = 'active';

CREATE INDEX entry_passes_event_status_idx
  ON public.entry_passes (event_id, status);

CREATE INDEX entry_passes_holder_id_idx
  ON public.entry_passes (holder_id)
  WHERE holder_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. qr_codes — extend entity_type only (D4)
-- qr_codes_entity_active_unique NOT revised in 037 (migration 038)
-- ---------------------------------------------------------------------------

ALTER TABLE public.qr_codes
  DROP CONSTRAINT IF EXISTS qr_codes_entity_type_check;

ALTER TABLE public.qr_codes
  ADD CONSTRAINT qr_codes_entity_type_check CHECK (
    entity_type IN (
      'ticket',
      'table_reservation',
      'seat_reservation',
      'hotel_internal',
      'entry_pass'
    )
  );
