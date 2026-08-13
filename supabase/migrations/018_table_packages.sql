-- FAZ 0 v1.4.1 — Migration 018: table_packages and related package tables
-- Same-event validation (033); indexes, RLS, RPC: later migrations

CREATE TABLE public.table_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  event_table_id uuid NOT NULL REFERENCES public.event_tables (id),
  name text NOT NULL,
  base_price numeric(12, 2) NOT NULL,
  deposit_amount numeric(12, 2) NULL DEFAULT 0,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.table_packages (id),
  name text NOT NULL,
  item_category text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_label text NULL,
  is_default_included boolean NOT NULL DEFAULT true,
  is_customer_selectable boolean NOT NULL DEFAULT false,
  min_select int NULL DEFAULT 0,
  max_select int NULL DEFAULT 1,
  sort_order int NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT package_items_item_category_check CHECK (
    item_category IN (
      'beverage',
      'soft_drink',
      'water',
      'food',
      'fruit',
      'other'
    )
  )
);

CREATE TABLE public.package_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_item_id uuid NOT NULL REFERENCES public.package_items (id),
  option_name text NOT NULL,
  is_default boolean NULL DEFAULT false,
  price_delta numeric(12, 2) NULL DEFAULT 0,
  sort_order int NULL DEFAULT 0
);

CREATE TABLE public.package_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.table_packages (id),
  name text NOT NULL,
  upgrade_type text NOT NULL,
  price_delta numeric(12, 2) NULL DEFAULT 0,
  description text NULL,
  max_quantity int NULL DEFAULT 1,
  sort_order int NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT package_upgrades_upgrade_type_check CHECK (
    upgrade_type IN ('swap', 'addon', 'extra')
  )
);

CREATE TABLE public.package_upgrade_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upgrade_id uuid NOT NULL REFERENCES public.package_upgrades (id),
  option_name text NOT NULL,
  price_delta numeric(12, 2) NOT NULL DEFAULT 0,
  linked_package_item_id uuid NULL REFERENCES public.package_items (id),
  sort_order int NULL DEFAULT 0
);
