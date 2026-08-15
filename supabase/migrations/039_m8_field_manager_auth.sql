-- Migration 039 — M8 field manager auth (decisions 033-M8-039, D11-B)
-- Scope: roles seed + can_operate_event only.
-- Migrations 035 / 036 / 037 / 038 are not modified.
-- can_manage_event / can_scan_event / can_settle_event are not modified.
-- role_permissions: not modified. RLS: not modified. RPC: not modified.

-- ---------------------------------------------------------------------------
-- 1. roles seed — 5 legacy staff roles + field_manager (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO public.roles (code, name, description)
VALUES
  (
    'admin',
    'Admin',
    'Full event staff administration for assigned events.'
  ),
  (
    'reservation',
    'Reservation',
    'Venue collection and reservation settlement staff.'
  ),
  (
    'event',
    'Event',
    'Event catalog and pricing management staff.'
  ),
  (
    'door_staff',
    'Door Staff',
    'Door scanning staff.'
  ),
  (
    'accounting',
    'Accounting',
    'Financial settlement and accounting staff.'
  ),
  (
    'field_manager',
    'Field Manager',
    'On-site field operations staff; walk-in and operational actions (041+).'
  )
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. can_operate_event (D11-B)
-- Field operations rights: owner, super admin, admin staff, field_manager staff.
-- event role is intentionally excluded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_operate_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.owns_event(p_event_id)
      OR public.is_super_admin()
      OR public.has_event_staff_role(p_event_id, ARRAY['admin', 'field_manager']);
$$;

REVOKE ALL ON FUNCTION public.can_operate_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_operate_event(uuid) TO authenticated;
