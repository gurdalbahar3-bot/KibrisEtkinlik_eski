CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL REFERENCES public.orders(id),
  provider text NULL,
  provider_payment_id text NULL,
  amount numeric(12,2) NULL,
  currency text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'pending',
    'succeeded',
    'failed',
    'refunded_partial',
    'refunded_full'
  )),
  payment_method text NULL,
  paid_at timestamptz NULL,
  created_at timestamptz NULL
);

CREATE TABLE public.payment_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NULL REFERENCES public.payments(id),
  line_type text NULL CHECK (line_type IN (
    'gross',
    'commission',
    'platform_fee',
    'tax',
    'venue_share',
    'organizer_share',
    'deposit',
    'refund',
    'service_fee',
    'venue_balance',
    'other'
  )),
  line_role text NOT NULL CHECK (line_role IN (
    'obligation',
    'allocation_online',
    'allocation_venue',
    'commission',
    'tax',
    'refund',
    'fee',
    'adjustment'
  )),
  amount numeric(12,2) NULL,
  description text NULL,
  reference_type text NULL,
  reference_id text NULL,
  created_at timestamptz NULL
);

CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  payment_id uuid NULL REFERENCES public.payments(id),
  payment_line_item_id uuid NULL REFERENCES public.payment_line_items(id),
  reservation_type text NULL CHECK (reservation_type IN ('table_reservation')),
  reservation_id uuid NULL,
  amount numeric(12,2) NULL,
  status text NOT NULL CHECK (status IN (
    'collected',
    'non_refundable'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tax_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_line_item_id uuid NULL REFERENCES public.payment_line_items(id),
  tax_type text NULL,
  tax_rate numeric(5,2) NULL,
  tax_amount numeric(12,2) NULL,
  responsible_party text NULL
);

CREATE TABLE public.commission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  payment_line_item_id uuid NOT NULL REFERENCES public.payment_line_items(id),
  event_id uuid NOT NULL REFERENCES public.events(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  gross_amount numeric(12,2) NOT NULL,
  commission_rate numeric(5,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settlement_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  payment_line_item_id uuid NOT NULL REFERENCES public.payment_line_items(id),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  recipient_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN (
    'pending',
    'settled'
  )),
  settled_at timestamptz NULL
);

CREATE TABLE public.refund_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  initiated_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);