-- FAZ 0 v1.4.1 — Migration 023: tickets, table_reservations, seat_reservations
-- Cross-event validation (033); partial unique, indexes, RLS, RPC: later migrations
-- qr_code_id FK: migration 025 (C1)

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  ticket_type_id uuid NOT NULL REFERENCES public.event_ticket_types (id),
  zone_id uuid NOT NULL REFERENCES public.event_ticket_zones (id),
  order_id uuid NOT NULL REFERENCES public.orders (id),
  order_item_id uuid NULL REFERENCES public.order_items (id),
  holder_id uuid NOT NULL REFERENCES public.profiles (id),
  status text NOT NULL DEFAULT 'pending_payment',
  qr_code_id uuid NULL,
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_status_check CHECK (
    status IN (
      'pending_payment',
      'active',
      'transferred',
      'used',
      'cancelled_by_organizer'
    )
  )
);

CREATE TABLE public.table_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id),
  table_id uuid NOT NULL REFERENCES public.venue_tables (id),
  event_table_id uuid NOT NULL REFERENCES public.event_tables (id),
  package_id uuid NOT NULL REFERENCES public.table_packages (id),
  order_id uuid NOT NULL REFERENCES public.orders (id),
  order_item_id uuid NULL REFERENCES public.order_items (id),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  status text NOT NULL DEFAULT 'pending_payment',
  guest_count int NULL,
  snapshot_base_price numeric(12, 2) NOT NULL,
  snapshot_package_name text NOT NULL,
  qr_code_id uuid NULL,
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  snapshot_total_amount numeric(12, 2) NULL,
  snapshot_deposit_amount numeric(12, 2) NULL,
  snapshot_remaining_amount numeric(12, 2) NULL,
  venue_collected_amount numeric(12, 2) NULL DEFAULT 0,
  venue_collected_at timestamptz NULL,
  financial_status text NOT NULL,
  CONSTRAINT table_reservations_status_check CHECK (
    status IN (
      'pending_payment',
      'confirmed',
      'transferred',
      'used',
      'cancelled_by_organizer'
    )
  ),
  CONSTRAINT table_reservations_financial_status_check CHECK (
    financial_status IN (
      'pending_payment',
      'online_paid',
      'partially_collected_at_venue',
      'venue_balance_settled'
    )
  )
);

CREATE TABLE public.seat_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NULL REFERENCES public.events (id),
  seat_id uuid NULL,
  order_id uuid NULL REFERENCES public.orders (id),
  order_item_id uuid NULL REFERENCES public.order_items (id),
  customer_id uuid NOT NULL,
  status text NULL,
  snapshot_price numeric(12, 2) NOT NULL,
  qr_code_id uuid NULL,
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seat_reservations_status_check CHECK (
    status IN (
      'pending_payment',
      'confirmed',
      'transferred',
      'used',
      'cancelled'
    )
  )
);
