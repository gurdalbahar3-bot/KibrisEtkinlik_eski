-- P0 Phase B1 — Payment foundation (staging)
-- Staging-only target: nksctgxmkymmiubkrohf
-- Production intentionally untouched
-- Does NOT modify 058/059/060/061 files
-- Does NOT call iyzico
--
-- Adds:
--   payment_webhook_events (idempotency)
--   payment_sessions
--   payments unique (provider, provider_payment_id)
--   orders currency default trigger (TRY on INSERT when NULL; no backfill)
-- Hardens:
--   confirm_payment_atomic amount/currency/provider identity gates
-- Preserves:
--   service_role EXECUTE only on confirm/fail (re-asserted)
--   paid noop + expired→paid forbidden (trigger unchanged)

BEGIN;

-- ============================================================
-- §1 payment_webhook_events
-- Store raw JSON for replay/debug. Access: service_role only (no client SELECT).
-- PII note: provider payloads may include email/name — retain only as needed for
-- dispute/idempotency; RLS blocks authenticated/anon reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NULL,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN (
      'received',
      'processing',
      'processed',
      'ignored',
      'failed'
    )),
  order_id uuid NULL REFERENCES public.orders (id),
  payment_id uuid NULL REFERENCES public.payments (id),
  error_code text NULL,
  error_message text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_provider_event_unique
    UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_order_id_idx
  ON public.payment_webhook_events (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_webhook_events
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- §2 payment_sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id),
  provider text NOT NULL,
  provider_token text NULL,
  conversation_id text NOT NULL,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created',
      'redirected',
      'awaiting_provider',
      'succeeded',
      'failed',
      'expired',
      'cancelled'
    )),
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one in-flight session per order
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_one_active_per_order
  ON public.payment_sessions (order_id)
  WHERE status IN ('created', 'redirected', 'awaiting_provider');

CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_provider_token_unique
  ON public.payment_sessions (provider, provider_token)
  WHERE provider_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_sessions_conversation_id_idx
  ON public.payment_sessions (conversation_id);

ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_sessions
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.payment_sessions TO authenticated;

DROP POLICY IF EXISTS payment_sessions_select_own ON public.payment_sessions;
CREATE POLICY payment_sessions_select_own ON public.payment_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin())
  ));

-- ============================================================
-- §3 payments unique provider payment identity (NULL-safe)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_unique
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- ============================================================
-- §4 orders.currency — new rows default TRY; do NOT backfill existing NULLs
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_orders_default_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    NEW.currency := 'TRY';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_default_currency ON public.orders;
CREATE TRIGGER trg_orders_default_currency
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_default_currency();

COMMENT ON FUNCTION public.trg_orders_default_currency() IS
  'Phase B1: set currency=TRY on INSERT when NULL/blank. No UPDATE backfill.';

-- ============================================================
-- §5 Harden confirm_payment_atomic (040 body + amount/currency gates)
-- ACL re-asserted after REPLACE (061 posture).
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount numeric,
  p_currency text,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_payment_id uuid;
  v_row RECORD;
  v_qr_id uuid;
  v_line_item_id uuid;
  v_capacity_error text;
  v_i integer;
  v_existing_payment_id uuid;
BEGIN
  IF NOT (public.is_service_context() OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_FOUND');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_order.event_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  IF v_order.status = 'paid' THEN
    SELECT p.id INTO v_existing_payment_id
    FROM public.payments AS p
    WHERE p.order_id = p_order_id
      AND p.status = 'succeeded'
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'payment_id', v_existing_payment_id,
      'noop', true
    );
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_PAYABLE');
  END IF;

  -- B1 gates: verified settlement must match order ledger
  IF v_order.currency IS NULL OR btrim(v_order.currency) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_CURRENCY_MISSING');
  END IF;

  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_REQUIRED');
  END IF;

  IF p_provider_payment_id IS NULL OR btrim(p_provider_payment_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_PAYMENT_ID_REQUIRED');
  END IF;

  IF p_currency IS NULL OR upper(btrim(p_currency)) <> upper(btrim(v_order.currency)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CURRENCY_MISMATCH');
  END IF;

  IF p_amount IS NULL OR p_amount <> v_order.total_amount THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'AMOUNT_MISMATCH');
  END IF;

  BEGIN
    INSERT INTO public.payments (
      order_id, provider, provider_payment_id, amount, currency, status, payment_method, paid_at, created_at
    )
    VALUES (
      p_order_id, p_provider, p_provider_payment_id, p_amount, p_currency,
      'succeeded', p_payment_method, now(), now()
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT p.id INTO v_existing_payment_id
      FROM public.payments AS p
      WHERE p.provider = p_provider
        AND p.provider_payment_id = p_provider_payment_id
      LIMIT 1;

      IF v_existing_payment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders AS o
        WHERE o.id = p_order_id AND o.status = 'paid'
      ) THEN
        RETURN jsonb_build_object(
          'success', true,
          'order_id', p_order_id,
          'payment_id', v_existing_payment_id,
          'noop', true
        );
      END IF;

      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'DUPLICATE_PROVIDER_PAYMENT',
        'payment_id', v_existing_payment_id
      );
  END;

  -- Tickets: pending_payment → active, zone counters reserved → sold, QR issued
  FOR v_row IN
    SELECT * FROM public.tickets WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
    VALUES (
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ticket', v_row.id, v_row.event_id, v_row.holder_id, 'active', now()
    )
    RETURNING id INTO v_qr_id;

    UPDATE public.tickets
    SET status = 'active', qr_code_id = v_qr_id, confirmed_at = now()
    WHERE id = v_row.id;

    UPDATE public.event_ticket_zones
    SET reserved_count = GREATEST(reserved_count - 1, 0),
        sold_count = sold_count + 1
    WHERE id = v_row.zone_id;
  END LOOP;

  -- Seat reservations: pending_payment → confirmed
  FOR v_row IN
    SELECT * FROM public.seat_reservations WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
    VALUES (
      encode(extensions.gen_random_bytes(32), 'hex'),
      'seat_reservation', v_row.id, v_row.event_id, v_row.customer_id, 'active', now()
    )
    RETURNING id INTO v_qr_id;

    UPDATE public.seat_reservations
    SET status = 'confirmed', qr_code_id = v_qr_id, confirmed_at = now()
    WHERE id = v_row.id;
  END LOOP;

  -- Table reservations: pending_payment → confirmed + N entry_passes (K5: no legacy table QR)
  FOR v_row IN
    SELECT * FROM public.table_reservations WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.entry_passes AS ep
      WHERE ep.parent_type = 'table_reservation'
        AND ep.parent_id = v_row.id
    ) THEN
      UPDATE public.table_reservations
      SET status = 'confirmed',
          confirmed_at = COALESCE(confirmed_at, now()),
          collection_type = 'online'
      WHERE id = v_row.id;

      UPDATE public.table_reservations
      SET financial_status = 'online_paid'
      WHERE id = v_row.id AND financial_status = 'pending_payment';

      CONTINUE;
    END IF;

    IF v_row.guest_count IS NULL OR v_row.guest_count <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'GUEST_COUNT_REQUIRED');
    END IF;

    v_capacity_error := public.check_table_capacity_available(v_row.event_table_id, v_row.guest_count);
    IF v_capacity_error IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', v_capacity_error);
    END IF;

    UPDATE public.table_reservations
    SET status = 'confirmed',
        qr_code_id = NULL,
        confirmed_at = now(),
        collection_type = 'online'
    WHERE id = v_row.id;

    UPDATE public.table_reservations
    SET financial_status = 'online_paid'
    WHERE id = v_row.id AND financial_status = 'pending_payment';

    FOR v_i IN 1..v_row.guest_count LOOP
      PERFORM public.create_entry_pass_with_qr(
        'table_reservation',
        v_row.id,
        v_row.event_id,
        NULL,
        'online',
        NULL
      );
    END LOOP;

    IF COALESCE(v_row.snapshot_deposit_amount, 0) > 0 THEN
      INSERT INTO public.payment_line_items (
        payment_id, line_type, line_role, amount, description, reference_type, reference_id, created_at
      )
      VALUES (
        v_payment_id, 'deposit', 'allocation_online', v_row.snapshot_deposit_amount,
        v_row.snapshot_package_name, 'table_reservation', v_row.id::text, now()
      )
      RETURNING id INTO v_line_item_id;

      INSERT INTO public.deposits (
        order_id, payment_id, payment_line_item_id, reservation_type, reservation_id, amount, status
      )
      VALUES (
        p_order_id, v_payment_id, v_line_item_id, 'table_reservation', v_row.id,
        v_row.snapshot_deposit_amount, 'collected'
      );

      IF COALESCE(v_row.snapshot_remaining_amount, 0) > 0 THEN
        INSERT INTO public.payment_line_items (
          payment_id, line_type, line_role, amount, description, reference_type, reference_id, created_at
        )
        VALUES (
          v_payment_id, 'venue_balance', 'allocation_venue', v_row.snapshot_remaining_amount,
          v_row.snapshot_package_name, 'table_reservation', v_row.id::text, now()
        );
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.payment_line_items (
    payment_id, line_type, line_role, amount, description, reference_type, reference_id, created_at
  )
  VALUES (
    v_payment_id, 'gross', 'obligation', v_order.total_amount,
    'order gross', 'order', p_order_id::text, now()
  );

  UPDATE public.resource_locks
  SET status = 'converted'
  WHERE order_id = p_order_id AND status = 'active';

  UPDATE public.orders
  SET status = 'paid',
      paid_at = now(),
      amount_paid_online = p_amount,
      amount_remaining = v_order.total_amount - p_amount,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.payment_sessions
  SET status = 'succeeded',
      updated_at = now()
  WHERE order_id = p_order_id
    AND status IN ('created', 'redirected', 'awaiting_provider');

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_id', v_payment_id);
END;
$$;

COMMENT ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text) IS
  'Confirm payment + activate tickets/QR. B1: amount/currency/provider gates. Service role only.';

REVOKE ALL ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.fail_payment_atomic(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_atomic(uuid, text, text, text)
  TO service_role;

COMMIT;
