-- 065 — MVP QR scan_result constraint + scheduled expiry service_role (staging)
-- Fixes:
--   P0) qr_scan_logs_scan_result_check rejects 'cancelled' / 'not_active'
--       which use_qr_atomic (064) writes for inactive/cancelled entities,
--       causing a constraint exception instead of a clean rejection.
--   P1) expire_due_pending_orders_atomic still required auth.uid(), so
--       service_role cron/ops got UNAUTHENTICATED despite 064 GRANT.
--
-- Does NOT modify 064 file. Does NOT touch 058/059/060.
-- Production apply is out of scope for this migration authoring step.

-- ---------------------------------------------------------------------------
-- P0: Expand qr_scan_logs.scan_result CHECK to match use_qr_atomic + UI
--     Allowed (025 + 064 domain):
--       valid | invalid | already_used | revoked | cancelled | not_active
-- ---------------------------------------------------------------------------
ALTER TABLE public.qr_scan_logs
  DROP CONSTRAINT IF EXISTS qr_scan_logs_scan_result_check;

ALTER TABLE public.qr_scan_logs
  ADD CONSTRAINT qr_scan_logs_scan_result_check
  CHECK (
    scan_result IS NULL
    OR scan_result IN (
      'valid',
      'invalid',
      'already_used',
      'revoked',
      'cancelled',
      'not_active'
    )
  );

COMMENT ON CONSTRAINT qr_scan_logs_scan_result_check ON public.qr_scan_logs IS
  '065: scan_result domain aligned with use_qr_atomic (incl. cancelled, not_active).';

-- ---------------------------------------------------------------------------
-- P1: expire_due_pending_orders_atomic — allow service_role / service context
--     while preserving authenticated trigger path.
--     Scope unchanged: only pending_payment + expires_at < now().
--     Per-order ACL remains inside expire_order_atomic (incl. past-due path).
-- ---------------------------------------------------------------------------
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
  -- Authenticated callers OR service_role / service context (cron/ops).
  -- Do NOT open to anon (no GRANT). Do NOT expire non-due / non-pending orders.
  IF v_actor IS NULL AND NOT public.is_service_context() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  FOR v_row IN
    SELECT o.*
    FROM public.orders AS o
    WHERE o.status = 'pending_payment'
      AND o.expires_at IS NOT NULL
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
  '065: Expire due pending_payment holds. Authenticated or service_role/cron.';

REVOKE ALL ON FUNCTION public.expire_due_pending_orders_atomic()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_due_pending_orders_atomic()
  TO authenticated, service_role;
