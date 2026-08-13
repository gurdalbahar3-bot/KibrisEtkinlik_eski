-- FAZ 0 v1.4.1 — Migration 021: orders, order_items, order_item_selections
-- Immutability (033); RLS, RPC, indexes: later migrations

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  event_id uuid NOT NULL REFERENCES public.events (id),
  status text NOT NULL DEFAULT 'draft',
  subtotal_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NULL,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  amount_paid_online numeric(12, 2) NULL,
  amount_remaining numeric(12, 2) NULL,
  amount_due_now numeric(12, 2) NULL,
  CONSTRAINT orders_status_check CHECK (
    status IN (
      'draft',
      'pending_payment',
      'paid',
      'failed',
      'expired',
      'cancelled_by_organizer'
    )
  ),
  CONSTRAINT orders_amount_paid_remaining_total_check CHECK (
    amount_paid_online + amount_remaining = total_amount
  )
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id),
  item_type text NOT NULL,
  reference_id uuid NULL,
  zone_id uuid NULL REFERENCES public.event_ticket_zones (id),
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(12, 2) NOT NULL,
  total_price numeric(12, 2) NOT NULL,
  snapshot_label text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  amount_due_now numeric(12, 2) NULL,
  CONSTRAINT order_items_item_type_check CHECK (
    item_type IN ('ticket', 'seat', 'table', 'deposit', 'upgrade')
  )
);

CREATE TABLE public.order_item_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items (id),
  selection_type text NOT NULL,
  package_item_id uuid NULL REFERENCES public.package_items (id),
  package_upgrade_id uuid NULL REFERENCES public.package_upgrades (id),
  upgrade_option_id uuid NULL REFERENCES public.package_upgrade_options (id),
  snapshot_item_name text NOT NULL,
  snapshot_option_name text NULL,
  snapshot_category text NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price_delta numeric(12, 2) NOT NULL DEFAULT 0,
  line_total_delta numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_item_selections_selection_type_check CHECK (
    selection_type IN ('included_item', 'upgrade')
  )
);
