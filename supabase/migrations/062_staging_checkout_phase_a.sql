-- P0 Phase A — Checkout enablement (staging)
-- Staging-only
-- Production intentionally untouched
-- Do not replay 051-055
-- Does NOT modify 058/059/060/061 files
--
-- Fixes:
--   ticket_status missing 'cancelled_by_organizer' (expire/fail_payment broken)
-- Adds:
--   unique one pending_payment order per (customer_id, event_id)
--   expire_due_pending_orders_atomic — server-time bulk expire
--   checkout_ticket_only_atomic — ticket-only cart + resume pending

-- §1 Enum drift fix (must commit before runtime use; body literals resolve at call time)
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'cancelled_by_organizer';

-- §2 Double-submit / resume: at most one active pending order per customer+event
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_per_customer_event
  ON public.orders (customer_id, event_id)
  WHERE status = 'pending_payment';

-- §3 Expire all due pending orders (server clock). Authenticated may trigger;
--     releasing stale capacity is safe and not customer-scoped.
CREATE OR REPLACE FUNCTION public.expire_due_pending_orders_atomic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.orders%ROWTYPE;
  v_count int := 0;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  FOR v_row IN
    SELECT o.*
    FROM public.orders AS o
    WHERE o.status = 'pending_payment'
      AND o.expires_at < now()
    ORDER BY o.expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_result := public.expire_order_atomic(v_row.id);
    IF COALESCE((v_result ->> 'success')::boolean, false) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$$;

COMMENT ON FUNCTION public.expire_due_pending_orders_atomic() IS
  'Expire all pending_payment orders past expires_at. Phase A staging 062.';

REVOKE ALL ON FUNCTION public.expire_due_pending_orders_atomic()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_due_pending_orders_atomic()
  TO authenticated;

-- §4 Ticket-only checkout with resume of active pending order
CREATE OR REPLACE FUNCTION public.checkout_ticket_only_atomic(
  p_event_id uuid,
  p_zone_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pending public.orders%ROWTYPE;
  v_items jsonb;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
  END IF;

  -- Drop stale holds first (server clock)
  PERFORM public.expire_due_pending_orders_atomic();

  SELECT o.*
  INTO v_pending
  FROM public.orders AS o
  WHERE o.customer_id = v_user_id
    AND o.event_id = p_event_id
    AND o.status = 'pending_payment'
  FOR UPDATE;

  IF FOUND THEN
    IF v_pending.expires_at >= now() THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_pending.id,
        'resumed', true,
        'expires_at', v_pending.expires_at
      );
    END IF;

    v_result := public.expire_order_atomic(v_pending.id);
    IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', COALESCE(v_result ->> 'error_code', 'EXPIRE_FAILED')
      );
    END IF;
  END IF;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'item_type', 'ticket',
      'zone_id', p_zone_id,
      'ticket_type_id', p_ticket_type_id,
      'quantity', p_quantity
    )
  );

  BEGIN
    v_result := public.create_mixed_cart_atomic(p_event_id, v_items);
  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.*
      INTO v_pending
      FROM public.orders AS o
      WHERE o.customer_id = v_user_id
        AND o.event_id = p_event_id
        AND o.status = 'pending_payment'
      LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'order_id', v_pending.id,
          'resumed', true,
          'expires_at', v_pending.expires_at
        );
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_CONFLICT');
  END;

  IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', COALESCE(v_result ->> 'error_code', 'CART_FAILED'),
      'detail', v_result
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_result ->> 'order_id',
    'order_item_ids', v_result -> 'order_item_ids',
    'resumed', false
  );
END;
$$;

COMMENT ON FUNCTION public.checkout_ticket_only_atomic(uuid, uuid, uuid, integer) IS
  'Ticket-only checkout. Resumes active pending order for same customer+event. Phase A 062.';

REVOKE ALL ON FUNCTION public.checkout_ticket_only_atomic(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_ticket_only_atomic(uuid, uuid, uuid, integer)
  TO authenticated;
