-- Migration 034 — RLS policies, 17 atomic RPC functions, indexes
-- FAZ 0 v1.3 FINAL LOCKED SPEC — §9 concurrency, §10 validation, §12 SECURITY DEFINER + RLS
-- DRAFT — NOT DEPLOYED. See report for open ambiguities before applying.
--
-- Security model:
--   1. Deny by default through RLS. Every public table has RLS enabled; a table
--      with no permissive policy is unreachable for anon / authenticated even
--      when a table-level GRANT exists.
--   2. No direct client INSERT/UPDATE/DELETE on any critical table. Writes flow
--      exclusively through SECURITY DEFINER RPC (function owner bypasses RLS).
--   3. The three tables that do expose a self-service write policy get a
--      targeted, table-scoped REVOKE followed by a column-level GRANT, so that
--      status / role / key columns can never be written directly. No blanket
--      schema-wide or FROM PUBLIC revoke is used.
--   4. auth.uid() is the only authority; no caller-supplied user id parameters.

-- ===========================================================================
-- SECTION 0 — Missing schema object required by the postpone / reschedule RPCs
-- Spec §7.1: postponement / rescheduling audit trail. Declared for migration
-- 012 in the spec but deferred there, so it is created here.
-- ===========================================================================

CREATE TABLE public.event_schedule_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  change_type text NOT NULL,
  previous_status public.event_status NOT NULL,
  new_status public.event_status NOT NULL,
  previous_starts_at timestamptz NOT NULL,
  previous_ends_at timestamptz NULL,
  new_starts_at timestamptz NOT NULL,
  new_ends_at timestamptz NULL,
  reason text NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_schedule_changes_change_type_check CHECK (
    change_type IN ('postpone', 'reschedule')
  )
);

-- ===========================================================================
-- SECTION 1 — Authorization helper functions
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admin_profiles AS sap
    WHERE sap.profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_venue(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venues AS v
    WHERE v.id = p_venue_id
      AND v.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events AS e
    WHERE e.id = p_event_id
      AND e.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.event_is_published(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events AS e
    WHERE e.id = p_event_id
      AND e.status IN ('published', 'postponed', 'completed')
  );
$$;

-- Staff access scoped to a single event, honouring assignment status and expiry.
CREATE OR REPLACE FUNCTION public.has_event_staff_role(
  p_event_id uuid,
  p_role_codes text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_staff_permissions AS esp
    JOIN public.staff_assignments AS sa
      ON sa.id = esp.staff_assignment_id
    JOIN public.roles AS r
      ON r.id = esp.role_id
    WHERE esp.event_id = p_event_id
      AND sa.profile_id = auth.uid()
      AND sa.status = 'active'
      AND (esp.expires_at IS NULL OR esp.expires_at > now())
      AND (p_role_codes IS NULL OR r.code = ANY (p_role_codes))
  );
$$;

CREATE OR REPLACE FUNCTION public.has_event_staff_access(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_event_staff_role(p_event_id, NULL);
$$;

-- Full management rights over an event (catalog, pricing, packages, blocks).
CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.owns_event(p_event_id)
      OR public.is_super_admin()
      OR public.has_event_staff_role(p_event_id, ARRAY['admin', 'event']);
$$;

-- Door scanning rights.
CREATE OR REPLACE FUNCTION public.can_scan_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.owns_event(p_event_id)
      OR public.is_super_admin()
      OR public.has_event_staff_role(p_event_id, ARRAY['admin', 'door_staff']);
$$;

-- Venue collection / financial read rights.
CREATE OR REPLACE FUNCTION public.can_settle_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.owns_event(p_event_id)
      OR public.is_super_admin()
      OR public.has_event_staff_role(p_event_id, ARRAY['admin', 'accounting', 'reservation']);
$$;

-- Trusted server-side caller. The JWT role claim is inspected explicitly rather
-- than inferring it from a NULL auth.uid(), because anon also has a NULL uid.
-- A completely absent claim means a direct database connection (psql, cron),
-- which is already trusted.
CREATE OR REPLACE FUNCTION public.is_service_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_setting('request.jwt.claims', true) IS NULL
      OR COALESCE(
           current_setting('request.jwt.claims', true)::jsonb ->> 'role',
           ''
         ) = 'service_role';
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_venue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_is_published(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_event_staff_role(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_event_staff_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_scan_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_settle_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_service_context() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_venue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_is_published(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_event_staff_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_event_staff_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_scan_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_settle_event(uuid) TO authenticated;

-- ===========================================================================
-- SECTION 2 — Enable RLS on every public table
-- 64 tables from migrations 001-033 + event_schedule_changes = 65
-- ===========================================================================

ALTER TABLE public.event_schedule_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_owner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_venue_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_seat_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_resource_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_upgrade_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_return_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_scan_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_event_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_listings ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- SECTION 3 — Public catalog (anon + authenticated read only)
-- ===========================================================================

GRANT SELECT ON public.events TO anon, authenticated;
CREATE POLICY events_select_public ON public.events
  FOR SELECT TO anon, authenticated
  USING (status IN ('published', 'postponed', 'completed'));

CREATE POLICY events_select_owner ON public.events
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin() OR public.has_event_staff_access(id));

GRANT SELECT ON public.venues TO anon, authenticated;
CREATE POLICY venues_select_public ON public.venues
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY venues_select_owner ON public.venues
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin());

-- Venue layout is public only while the parent venue is active. The activity
-- flag in this schema is venues.status ('active' / 'inactive'); there is no
-- venues.is_active column. Being referenced by a published event does not widen
-- this: the layout policies never consult events.
GRANT SELECT ON public.venue_areas TO anon, authenticated;
CREATE POLICY venue_areas_select_active_venue ON public.venue_areas
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venues AS v
    WHERE v.id = public.venue_areas.venue_id AND v.status = 'active'
  ));

CREATE POLICY venue_areas_select_owner ON public.venue_areas
  FOR SELECT TO authenticated
  USING (public.owns_venue(venue_id) OR public.is_super_admin());

GRANT SELECT ON public.venue_tables TO anon, authenticated;
CREATE POLICY venue_tables_select_active_venue ON public.venue_tables
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venues AS v
    WHERE v.id = public.venue_tables.venue_id AND v.status = 'active'
  ));

CREATE POLICY venue_tables_select_owner ON public.venue_tables
  FOR SELECT TO authenticated
  USING (public.owns_venue(venue_id) OR public.is_super_admin());

GRANT SELECT ON public.venue_seats TO anon, authenticated;
CREATE POLICY venue_seats_select_active_venue ON public.venue_seats
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.venues AS v
    WHERE v.id = public.venue_seats.venue_id AND v.status = 'active'
  ));

CREATE POLICY venue_seats_select_owner ON public.venue_seats
  FOR SELECT TO authenticated
  USING (public.owns_venue(venue_id) OR public.is_super_admin());

GRANT SELECT ON public.artists TO anon, authenticated;
CREATE POLICY artists_select_public ON public.artists
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_super_admin());

GRANT SELECT ON public.event_artists TO anon, authenticated;
CREATE POLICY event_artists_select_public ON public.event_artists
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_formats TO anon, authenticated;
CREATE POLICY event_formats_select_public ON public.event_formats
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_locations TO anon, authenticated;
CREATE POLICY event_locations_select_public ON public.event_locations
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.wedding_details TO anon, authenticated;
CREATE POLICY wedding_details_select_public ON public.wedding_details
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_ticket_zones TO anon, authenticated;
CREATE POLICY event_ticket_zones_select_public ON public.event_ticket_zones
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_ticket_types TO anon, authenticated;
CREATE POLICY event_ticket_types_select_public ON public.event_ticket_types
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_seat_pricing TO anon, authenticated;
CREATE POLICY event_seat_pricing_select_public ON public.event_seat_pricing
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_tables TO anon, authenticated;
CREATE POLICY event_tables_select_public ON public.event_tables
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.event_resource_blocks TO anon, authenticated;
CREATE POLICY event_resource_blocks_select_public ON public.event_resource_blocks
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.table_packages TO anon, authenticated;
CREATE POLICY table_packages_select_public ON public.table_packages
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.package_items TO anon, authenticated;
CREATE POLICY package_items_select_public ON public.package_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.table_packages AS tp
    WHERE tp.id = package_id
      AND (public.event_is_published(tp.event_id) OR public.can_manage_event(tp.event_id))
  ));

GRANT SELECT ON public.package_item_options TO anon, authenticated;
CREATE POLICY package_item_options_select_public ON public.package_item_options
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.package_items AS pi
    JOIN public.table_packages AS tp ON tp.id = pi.package_id
    WHERE pi.id = package_item_id
      AND (public.event_is_published(tp.event_id) OR public.can_manage_event(tp.event_id))
  ));

GRANT SELECT ON public.package_upgrades TO anon, authenticated;
CREATE POLICY package_upgrades_select_public ON public.package_upgrades
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.table_packages AS tp
    WHERE tp.id = package_id
      AND (public.event_is_published(tp.event_id) OR public.can_manage_event(tp.event_id))
  ));

GRANT SELECT ON public.package_upgrade_options TO anon, authenticated;
CREATE POLICY package_upgrade_options_select_public ON public.package_upgrade_options
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.package_upgrades AS pu
    JOIN public.table_packages AS tp ON tp.id = pu.package_id
    WHERE pu.id = upgrade_id
      AND (public.event_is_published(tp.event_id) OR public.can_manage_event(tp.event_id))
  ));

GRANT SELECT ON public.bus_routes TO anon, authenticated;
CREATE POLICY bus_routes_select_public ON public.bus_routes
  FOR SELECT TO anon, authenticated
  USING (public.event_is_published(event_id) OR public.can_manage_event(event_id));

GRANT SELECT ON public.bus_stops TO anon, authenticated;
CREATE POLICY bus_stops_select_public ON public.bus_stops
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bus_routes AS br
    WHERE br.id = route_id
      AND (public.event_is_published(br.event_id) OR public.can_manage_event(br.event_id))
  ));

GRANT SELECT ON public.bus_return_times TO anon, authenticated;
CREATE POLICY bus_return_times_select_public ON public.bus_return_times
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bus_routes AS br
    WHERE br.id = route_id
      AND (public.event_is_published(br.event_id) OR public.can_manage_event(br.event_id))
  ));

GRANT SELECT ON public.social_links TO anon, authenticated;
CREATE POLICY social_links_select_public ON public.social_links
  FOR SELECT TO anon, authenticated
  USING (true);

-- ===========================================================================
-- SECTION 4 — Self-service data (authenticated, own rows only)
-- ===========================================================================

-- Targeted, table-scoped revoke so the column-level GRANT below is the only
-- writable surface: account_type / verification_status stay RPC-or-admin only.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON public.profiles TO authenticated;

-- Own row only (plus the super-admin read from the §38 access matrix). There is
-- deliberately no name / e-mail / phone lookup policy here, so transfer
-- recipients cannot be discovered by searching this table.
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin());

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

GRANT SELECT ON public.customer_profiles TO authenticated;
CREATE POLICY customer_profiles_select_self ON public.customer_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_super_admin());

GRANT SELECT ON public.venue_owner_profiles TO authenticated;
CREATE POLICY venue_owner_profiles_select_self ON public.venue_owner_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_super_admin());

GRANT SELECT ON public.organizer_profiles TO authenticated;
CREATE POLICY organizer_profiles_select_self ON public.organizer_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_super_admin());

GRANT SELECT ON public.super_admin_profiles TO authenticated;
CREATE POLICY super_admin_profiles_select_self ON public.super_admin_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_super_admin());

-- Self-service upgrade application. The applicant column in this schema is
-- account_applications.applicant_id (there is no user_id column). Targeted
-- revoke first, then a column-level INSERT grant: status, reviewed_by,
-- reviewed_at and rejection_reason are unreachable, so the row always lands on
-- the 'pending' default and the admin review path stays off the client.
REVOKE INSERT, UPDATE, DELETE ON public.account_applications FROM anon, authenticated;

GRANT SELECT ON public.account_applications TO authenticated;
GRANT INSERT (applicant_id, type) ON public.account_applications TO authenticated;

CREATE POLICY account_applications_select_self ON public.account_applications
  FOR SELECT TO authenticated
  USING (applicant_id = auth.uid() OR public.is_super_admin());

CREATE POLICY account_applications_insert_self ON public.account_applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_id = auth.uid() AND status = 'pending');

GRANT SELECT ON public.orders TO authenticated;
CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(event_id));

GRANT SELECT ON public.order_items TO authenticated;
CREATE POLICY order_items_select_own ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

GRANT SELECT ON public.order_item_selections TO authenticated;
CREATE POLICY order_item_selections_select_own ON public.order_item_selections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    WHERE oi.id = order_item_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

GRANT SELECT ON public.resource_locks TO authenticated;
CREATE POLICY resource_locks_select_own ON public.resource_locks
  FOR SELECT TO authenticated
  USING (locked_by_user_id = auth.uid() OR public.is_super_admin() OR public.can_manage_event(event_id));

GRANT SELECT ON public.tickets TO authenticated;
CREATE POLICY tickets_select_own ON public.tickets
  FOR SELECT TO authenticated
  USING (holder_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(event_id) OR public.can_scan_event(event_id));

GRANT SELECT ON public.table_reservations TO authenticated;
CREATE POLICY table_reservations_select_own ON public.table_reservations
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(event_id) OR public.can_scan_event(event_id));

GRANT SELECT ON public.seat_reservations TO authenticated;
CREATE POLICY seat_reservations_select_own ON public.seat_reservations
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(event_id) OR public.can_scan_event(event_id));

GRANT SELECT ON public.qr_codes TO authenticated;
CREATE POLICY qr_codes_select_own ON public.qr_codes
  FOR SELECT TO authenticated
  USING (holder_id = auth.uid() OR public.is_super_admin() OR public.can_scan_event(event_id));

GRANT SELECT ON public.reservation_transfers TO authenticated;
CREATE POLICY reservation_transfers_select_own ON public.reservation_transfers
  FOR SELECT TO authenticated
  USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR initiated_by = auth.uid()
    OR public.is_super_admin()
  );

GRANT SELECT ON public.notifications TO authenticated;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

GRANT SELECT ON public.notification_deliveries TO authenticated;
CREATE POLICY notification_deliveries_select_own ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.notifications AS n
    WHERE n.id = notification_id
      AND (n.user_id = auth.uid() OR public.is_super_admin())
  ));

GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
CREATE POLICY follows_select_own ON public.follows
  FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR public.is_super_admin());

CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE TO authenticated
  USING (follower_id = auth.uid());

-- ===========================================================================
-- SECTION 5 — Financial data (read only, scoped)
-- ===========================================================================

GRANT SELECT ON public.payments TO authenticated;
CREATE POLICY payments_select_scoped ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

GRANT SELECT ON public.payment_line_items TO authenticated;
CREATE POLICY payment_line_items_select_scoped ON public.payment_line_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.payments AS p
    JOIN public.orders AS o ON o.id = p.order_id
    WHERE p.id = payment_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

GRANT SELECT ON public.deposits TO authenticated;
CREATE POLICY deposits_select_scoped ON public.deposits
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

GRANT SELECT ON public.refund_records TO authenticated;
CREATE POLICY refund_records_select_scoped ON public.refund_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

GRANT SELECT ON public.commission_records TO authenticated;
CREATE POLICY commission_records_select_scoped ON public.commission_records
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin() OR public.can_settle_event(event_id));

GRANT SELECT ON public.settlement_records TO authenticated;
CREATE POLICY settlement_records_select_scoped ON public.settlement_records
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.is_super_admin());

GRANT SELECT ON public.tax_line_items TO authenticated;
CREATE POLICY tax_line_items_select_scoped ON public.tax_line_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.payment_line_items AS pli
    JOIN public.payments AS p ON p.id = pli.payment_id
    JOIN public.orders AS o ON o.id = p.order_id
    WHERE pli.id = payment_line_item_id
      AND (public.is_super_admin() OR public.can_settle_event(o.event_id))
  ));

-- ===========================================================================
-- SECTION 6 — Owner / staff scoped operational data
-- ===========================================================================

GRANT SELECT ON public.event_venue_contacts TO authenticated;
CREATE POLICY event_venue_contacts_select_scoped ON public.event_venue_contacts
  FOR SELECT TO authenticated
  USING (public.can_manage_event(event_id) OR public.owns_venue(venue_id));

-- Schedule change history: event managers and super admin only. Whether the
-- affected customers should also read it is an open product decision, so no
-- customer-facing policy is created here.
GRANT SELECT ON public.event_schedule_changes TO authenticated;
CREATE POLICY event_schedule_changes_select_scoped ON public.event_schedule_changes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.can_manage_event(event_id));

GRANT SELECT ON public.qr_scan_logs TO authenticated;
CREATE POLICY qr_scan_logs_select_scoped ON public.qr_scan_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.can_scan_event(event_id) OR public.can_settle_event(event_id));

GRANT SELECT ON public.staff_invitations TO authenticated;
CREATE POLICY staff_invitations_select_scoped ON public.staff_invitations
  FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR public.is_super_admin()
    OR (venue_id IS NOT NULL AND public.owns_venue(venue_id))
    OR (organizer_id IS NOT NULL AND organizer_id = auth.uid())
  );

GRANT SELECT ON public.staff_assignments TO authenticated;
CREATE POLICY staff_assignments_select_scoped ON public.staff_assignments
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR assigned_by = auth.uid()
    OR public.is_super_admin()
    OR (venue_id IS NOT NULL AND public.owns_venue(venue_id))
    OR (organizer_id IS NOT NULL AND organizer_id = auth.uid())
  );

GRANT SELECT ON public.event_staff_permissions TO authenticated;
CREATE POLICY event_staff_permissions_select_scoped ON public.event_staff_permissions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.owns_event(event_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_assignments AS sa
      WHERE sa.id = staff_assignment_id
        AND sa.profile_id = auth.uid()
    )
  );

GRANT SELECT ON public.staff_devices TO authenticated;
CREATE POLICY staff_devices_select_scoped ON public.staff_devices
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff_assignments AS sa
      WHERE sa.id = staff_assignment_id
        AND sa.profile_id = auth.uid()
    )
  );

GRANT SELECT ON public.roles TO authenticated;
CREATE POLICY roles_select_authenticated ON public.roles
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.role_permissions TO authenticated;
CREATE POLICY role_permissions_select_authenticated ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

-- Targeted revoke keeps the primary key `key` out of reach of the update policy.
REVOKE UPDATE ON public.system_settings FROM anon, authenticated;

GRANT SELECT ON public.system_settings TO authenticated;
GRANT UPDATE (value, description, updated_at, updated_by) ON public.system_settings TO authenticated;

CREATE POLICY system_settings_select_authenticated ON public.system_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY system_settings_update_super_admin ON public.system_settings
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.notification_rules TO authenticated;
CREATE POLICY notification_rules_select_authenticated ON public.notification_rules
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.audit_logs TO authenticated;
CREATE POLICY audit_logs_select_super_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ===========================================================================
-- SECTION 7 — Event owner self-service catalog writes
-- Column-level grants keep `status` out of reach; publishing is RPC-only.
-- ===========================================================================

-- Targeted revoke first: without it the platform default table-level grant would
-- let an owner write events.status directly and bypass publish_event.
REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon, authenticated;

GRANT INSERT (
  owner_id, venue_id, title, description, category,
  is_free, is_wedding, starts_at, ends_at, cover_image_url
) ON public.events TO authenticated;

GRANT UPDATE (
  title, description, category, is_free, is_wedding,
  cover_image_url, updated_at
) ON public.events TO authenticated;

-- Two independent barriers against a client-side publish: `status` is absent
-- from the INSERT grant above (so it always takes the 'draft' default), and the
-- WITH CHECK below re-asserts 'draft' on the finished row.
CREATE POLICY events_insert_owner_draft ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.account_type IN ('venue_owner', 'organizer')
        AND p.verification_status = 'approved'
    )
  );

CREATE POLICY events_update_owner_draft ON public.events
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() AND status = 'draft')
  WITH CHECK (owner_id = auth.uid() AND status = 'draft');

-- ===========================================================================
-- SECTION 8 — Tables with NO permissive policy (deny all, RPC-only access)
-- ===========================================================================
--   super_admin_actions   — shell table (032), model undecided
--   featured_listings     — shell table (032), model undecided
--   offline_scan_queue    — V1 placeholder (031), no online path
--   offline_event_snapshots — V1 placeholder (031)
-- RLS is enabled with zero policies: no client role can read or write them.

-- ===========================================================================
-- SECTION 9 — Atomic RPC functions (17)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- RPC 1/17 — reserve_ticket_capacity_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_ticket_capacity_atomic(
  p_event_id uuid,
  p_zone_id uuid,
  p_ticket_type_id uuid,
  p_quantity int,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_zone public.event_ticket_zones%ROWTYPE;
  v_type public.event_ticket_types%ROWTYPE;
  v_order_id uuid := p_order_id;
  v_order_item_id uuid;
  v_updated int;
  v_total numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_QUANTITY');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = p_zone_id FOR UPDATE;
  IF NOT FOUND OR v_zone.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
  END IF;

  IF v_zone.sale_mode <> 'ticket_based' OR NOT v_zone.is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_SALE_MODE');
  END IF;

  SELECT * INTO v_type
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id AND zone_id = p_zone_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
  END IF;

  IF v_type.max_per_order IS NOT NULL AND p_quantity > v_type.max_per_order THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'MAX_PER_ORDER_EXCEEDED');
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.orders (customer_id, event_id, status, expires_at)
    VALUES (v_user_id, p_event_id, 'pending_payment', now() + interval '10 minutes')
    RETURNING id INTO v_order_id;
  ELSE
    PERFORM 1
    FROM public.orders
    WHERE id = v_order_id
      AND customer_id = v_user_id
      AND event_id = p_event_id
      AND status = 'pending_payment'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_USABLE');
    END IF;
  END IF;

  UPDATE public.event_ticket_zones
  SET reserved_count = reserved_count + p_quantity
  WHERE id = p_zone_id
    AND sold_count + reserved_count + p_quantity <= capacity;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CAPACITY_EXCEEDED');
  END IF;

  v_total := v_type.price * p_quantity;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, zone_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'ticket', p_ticket_type_id, p_zone_id, p_quantity,
    v_type.price, v_total, v_type.name, v_total
  )
  RETURNING id INTO v_order_item_id;

  INSERT INTO public.tickets (
    event_id, ticket_type_id, zone_id, order_id, order_item_id, holder_id, status
  )
  SELECT p_event_id, p_ticket_type_id, p_zone_id, v_order_id, v_order_item_id, v_user_id, 'pending_payment'
  FROM generate_series(1, p_quantity);

  UPDATE public.orders
  SET subtotal_amount = subtotal_amount + v_total,
      total_amount = total_amount + v_total,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_id', v_order_item_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 2/17 — reserve_seat_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_seat_atomic(
  p_event_id uuid,
  p_seat_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_pricing public.event_seat_pricing%ROWTYPE;
  v_zone public.event_ticket_zones%ROWTYPE;
  v_order_id uuid := p_order_id;
  v_order_item_id uuid;
  v_lock_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_pricing
  FROM public.event_seat_pricing
  WHERE event_id = p_event_id AND seat_id = p_seat_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_pricing.is_sellable THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = v_pricing.zone_id;
  IF NOT FOUND OR v_zone.sale_mode <> 'seat_based' OR NOT v_zone.is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_SALE_MODE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_resource_blocks
    WHERE event_id = p_event_id
      AND resource_type = 'seat'
      AND resource_id = p_seat_id
      AND is_active
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seat_reservations
    WHERE event_id = p_event_id
      AND seat_id = p_seat_id
      AND status IN ('confirmed', 'used', 'transferred')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_ALREADY_SOLD');
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.orders (customer_id, event_id, status, expires_at)
    VALUES (v_user_id, p_event_id, 'pending_payment', v_expires_at)
    RETURNING id INTO v_order_id;
  ELSE
    PERFORM 1
    FROM public.orders
    WHERE id = v_order_id
      AND customer_id = v_user_id
      AND event_id = p_event_id
      AND status = 'pending_payment'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_USABLE');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.resource_locks (
      event_id, resource_type, resource_id, locked_by_user_id, order_id, expires_at, status
    )
    VALUES (p_event_id, 'seat', p_seat_id, v_user_id, v_order_id, v_expires_at, 'active')
    RETURNING id INTO v_lock_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_LOCKED');
  END;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'seat', p_seat_id, 1,
    v_pricing.price, v_pricing.price, 'seat', v_pricing.price
  )
  RETURNING id INTO v_order_item_id;

  INSERT INTO public.seat_reservations (
    event_id, seat_id, order_id, order_item_id, customer_id, status, snapshot_price
  )
  VALUES (
    p_event_id, p_seat_id, v_order_id, v_order_item_id, v_user_id, 'pending_payment', v_pricing.price
  );

  UPDATE public.orders
  SET subtotal_amount = subtotal_amount + v_pricing.price,
      total_amount = total_amount + v_pricing.price,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_id', v_order_item_id,
    'lock_id', v_lock_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 3/17 — reserve_table_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_table_atomic(
  p_event_id uuid,
  p_table_id uuid,
  p_package_id uuid,
  p_guest_count int DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_event_table public.event_tables%ROWTYPE;
  v_package public.table_packages%ROWTYPE;
  v_order_id uuid := p_order_id;
  v_order_item_id uuid;
  v_lock_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_deposit numeric(12, 2);
  v_remaining numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_event_table
  FROM public.event_tables
  WHERE event_id = p_event_id AND table_id = p_table_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_event_table.is_sellable THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_NOT_SELLABLE');
  END IF;

  SELECT * INTO v_package
  FROM public.table_packages
  WHERE id = p_package_id
    AND event_id = p_event_id
    AND event_table_id = v_event_table.id
    AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_resource_blocks
    WHERE event_id = p_event_id
      AND resource_type = 'table'
      AND resource_id = p_table_id
      AND is_active
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.table_reservations
    WHERE event_id = p_event_id
      AND table_id = p_table_id
      AND status IN ('confirmed', 'used', 'transferred')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_ALREADY_SOLD');
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.orders (customer_id, event_id, status, expires_at)
    VALUES (v_user_id, p_event_id, 'pending_payment', v_expires_at)
    RETURNING id INTO v_order_id;
  ELSE
    PERFORM 1
    FROM public.orders
    WHERE id = v_order_id
      AND customer_id = v_user_id
      AND event_id = p_event_id
      AND status = 'pending_payment'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_USABLE');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.resource_locks (
      event_id, resource_type, resource_id, locked_by_user_id, order_id, expires_at, status
    )
    VALUES (p_event_id, 'table', p_table_id, v_user_id, v_order_id, v_expires_at, 'active')
    RETURNING id INTO v_lock_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TABLE_LOCKED');
  END;

  v_deposit := COALESCE(v_package.deposit_amount, 0);
  v_remaining := v_package.base_price - v_deposit;

  INSERT INTO public.order_items (
    order_id, item_type, reference_id, quantity,
    unit_price, total_price, snapshot_label, amount_due_now
  )
  VALUES (
    v_order_id, 'table', p_table_id, 1,
    v_package.base_price, v_package.base_price, v_package.name,
    CASE WHEN v_deposit > 0 THEN v_deposit ELSE v_package.base_price END
  )
  RETURNING id INTO v_order_item_id;

  INSERT INTO public.table_reservations (
    event_id, table_id, event_table_id, package_id, order_id, order_item_id,
    customer_id, status, guest_count,
    snapshot_base_price, snapshot_package_name,
    snapshot_total_amount, snapshot_deposit_amount, snapshot_remaining_amount,
    financial_status
  )
  VALUES (
    p_event_id, p_table_id, v_event_table.id, p_package_id, v_order_id, v_order_item_id,
    v_user_id, 'pending_payment', p_guest_count,
    v_package.base_price, v_package.name,
    v_package.base_price, v_deposit, v_remaining,
    'pending_payment'
  );

  UPDATE public.orders
  SET subtotal_amount = subtotal_amount + v_package.base_price,
      total_amount = total_amount + v_package.base_price,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_id', v_order_item_id,
    'lock_id', v_lock_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 4/17 — create_mixed_cart_atomic
-- Single order, N order_items. Delegates per-item logic to the reserve_* RPCs
-- so that locking and validation stay in one place (spec §9, 8 steps).
--
-- p_items contract (jsonb array, must be non-empty; every element is an object)
-- ..........................................................................
-- Discriminator: "item_type" — one of 'ticket', 'seat', 'table'. Any other
-- value raises INVALID_ITEM_TYPE and rolls back the whole cart. The three
-- values mirror the order_items.item_type CHECK constraint from migration 021.
--
-- item_type = 'ticket'   -> reserve_ticket_capacity_atomic
--   zone_id         uuid  REQUIRED  event_ticket_zones.id
--   ticket_type_id  uuid  REQUIRED  event_ticket_types.id
--   quantity        int   REQUIRED  > 0; NULL fails the RPC's quantity guard
--
-- item_type = 'seat'     -> reserve_seat_atomic
--   seat_id         uuid  REQUIRED  venue_seats.id (priced via event_seat_pricing)
--
-- item_type = 'table'    -> reserve_table_atomic
--   table_id        uuid  REQUIRED  venue_tables.id (must have a sellable
--                                   event_tables row for this event)
--   package_id      uuid  REQUIRED  table_packages.id, active and bound to the
--                                   same event + event_table; a missing or
--                                   mismatched value returns PACKAGE_NOT_FOUND
--   guest_count     int   OPTIONAL  omit / null / "" -> stored as NULL
--
-- All keys are read with ->> and cast, so JSON strings and JSON numbers are both
-- accepted for the int fields. Unknown extra keys on an element are ignored.
-- Every element is applied against the same p_event_id and the same order; the
-- first failing element aborts the transaction, so partial carts never persist.
--
-- NOT part of the contract: package option / upgrade selections. The
-- order_item_selections table exists (migration 021) but neither this RPC nor
-- reserve_table_atomic writes it, and the spec defines no p_items shape for it.
-- See the deployment note in the report — nothing is invented here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_mixed_cart_atomic(
  p_event_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_order_id uuid;
  v_item jsonb;
  v_result jsonb;
  v_item_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EMPTY_CART');
  END IF;

  -- STEP 1 — VALIDATE event
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_SELLABLE');
  END IF;

  IF v_event.is_wedding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEDDING_NOT_SELLABLE');
  END IF;

  -- STEP 2 — CREATE ORDER (single, pending_payment, +10 min)
  INSERT INTO public.orders (customer_id, event_id, status, expires_at)
  VALUES (v_user_id, p_event_id, 'pending_payment', now() + interval '10 minutes')
  RETURNING id INTO v_order_id;

  -- STEPS 3-7 — per item; any failure raises and rolls the whole cart back
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    CASE v_item ->> 'item_type'
      WHEN 'ticket' THEN
        v_result := public.reserve_ticket_capacity_atomic(
          p_event_id,
          (v_item ->> 'zone_id')::uuid,
          (v_item ->> 'ticket_type_id')::uuid,
          (v_item ->> 'quantity')::int,
          v_order_id
        );
      WHEN 'seat' THEN
        v_result := public.reserve_seat_atomic(
          p_event_id,
          (v_item ->> 'seat_id')::uuid,
          v_order_id
        );
      WHEN 'table' THEN
        v_result := public.reserve_table_atomic(
          p_event_id,
          (v_item ->> 'table_id')::uuid,
          (v_item ->> 'package_id')::uuid,
          NULLIF(v_item ->> 'guest_count', '')::int,
          v_order_id
        );
      ELSE
        RAISE EXCEPTION 'INVALID_ITEM_TYPE: %', v_item ->> 'item_type';
    END CASE;

    IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'CART_ITEM_FAILED: %', COALESCE(v_result ->> 'error_code', 'UNKNOWN');
    END IF;

    v_item_ids := v_item_ids || (v_result ->> 'order_item_id')::uuid;
  END LOOP;

  -- STEP 8 — COMMIT (implicit; caller transaction)
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_item_ids', to_jsonb(v_item_ids)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 5/17 — expire_order_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_order_atomic(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ticket RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_FOUND');
  END IF;

  IF NOT (
    public.is_service_context()
    OR public.is_super_admin()
    OR v_order.customer_id = auth.uid()
    OR public.can_manage_event(v_order.event_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'noop', true);
  END IF;

  -- Release ticket zone counters
  FOR v_ticket IN
    SELECT zone_id, count(*)::int AS qty
    FROM public.tickets
    WHERE order_id = p_order_id AND status = 'pending_payment'
    GROUP BY zone_id
  LOOP
    UPDATE public.event_ticket_zones
    SET reserved_count = GREATEST(reserved_count - v_ticket.qty, 0)
    WHERE id = v_ticket.zone_id;
  END LOOP;

  UPDATE public.tickets
  SET status = 'cancelled_by_organizer'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.seat_reservations
  SET status = 'cancelled'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.table_reservations
  SET status = 'cancelled_by_organizer'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.resource_locks
  SET status = 'released'
  WHERE order_id = p_order_id AND status = 'active';

  UPDATE public.orders
  SET status = 'expired', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 6/17 — confirm_payment_atomic
-- Service-role only. Lock order: events FOR UPDATE first (C11 lock order).
--
-- DELIBERATELY NOT WRITTEN HERE: commission_records, tax_line_items and
-- settlement_records. Spec §8.6 / §17 list the commission rate and base, the tax
-- rate and the settlement rate as undecided, so deriving those amounts would be
-- guesswork. Only the payment, order, reservation and payment_line_items updates
-- that the schema and spec define unambiguously are performed. Those three
-- tables must be populated by a follow-up migration once the rates are locked.
-- ---------------------------------------------------------------------------
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
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'noop', true);
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_PAYABLE');
  END IF;

  INSERT INTO public.payments (
    order_id, provider, provider_payment_id, amount, currency, status, payment_method, paid_at, created_at
  )
  VALUES (
    p_order_id, p_provider, p_provider_payment_id, p_amount, p_currency,
    'succeeded', p_payment_method, now(), now()
  )
  RETURNING id INTO v_payment_id;

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

  -- Table reservations: pending_payment → confirmed, financial_status → online_paid
  FOR v_row IN
    SELECT * FROM public.table_reservations WHERE order_id = p_order_id AND status = 'pending_payment'
  LOOP
    INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
    VALUES (
      encode(extensions.gen_random_bytes(32), 'hex'),
      'table_reservation', v_row.id, v_row.event_id, v_row.customer_id, 'active', now()
    )
    RETURNING id INTO v_qr_id;

    UPDATE public.table_reservations
    SET status = 'confirmed', qr_code_id = v_qr_id, confirmed_at = now()
    WHERE id = v_row.id;

    UPDATE public.table_reservations
    SET financial_status = 'online_paid'
    WHERE id = v_row.id AND financial_status = 'pending_payment';

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

  -- Gross obligation line for the whole order (spec §8.2: counted once)
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

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_id', v_payment_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 7/17 — fail_payment_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fail_payment_atomic(
  p_order_id uuid,
  p_provider text DEFAULT NULL,
  p_provider_payment_id text DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ticket RECORD;
BEGIN
  IF NOT (public.is_service_context() OR public.is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'noop', true);
  END IF;

  IF p_currency IS NOT NULL THEN
    INSERT INTO public.payments (
      order_id, provider, provider_payment_id, amount, currency, status, created_at
    )
    VALUES (p_order_id, p_provider, p_provider_payment_id, NULL, p_currency, 'failed', now());
  END IF;

  FOR v_ticket IN
    SELECT zone_id, count(*)::int AS qty
    FROM public.tickets
    WHERE order_id = p_order_id AND status = 'pending_payment'
    GROUP BY zone_id
  LOOP
    UPDATE public.event_ticket_zones
    SET reserved_count = GREATEST(reserved_count - v_ticket.qty, 0)
    WHERE id = v_ticket.zone_id;
  END LOOP;

  UPDATE public.tickets
  SET status = 'cancelled_by_organizer'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.seat_reservations
  SET status = 'cancelled'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.table_reservations
  SET status = 'cancelled_by_organizer'
  WHERE order_id = p_order_id AND status = 'pending_payment';

  UPDATE public.resource_locks
  SET status = 'released'
  WHERE order_id = p_order_id AND status = 'active';

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 8/17 — use_qr_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_qr_atomic(
  p_token text,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr public.qr_codes%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_scan_result text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_qr FROM public.qr_codes WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID');
  END IF;

  IF NOT public.can_scan_event(v_qr.event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_qr.event_id;
  IF v_event.status = 'postponed' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_POSTPONED');
  END IF;

  IF v_qr.status = 'used' THEN
    v_scan_result := 'already_used';
  ELSIF v_qr.status = 'revoked' THEN
    v_scan_result := 'revoked';
  ELSE
    v_scan_result := 'valid';
  END IF;

  INSERT INTO public.qr_scan_logs (
    qr_code_id, event_id, scanned_by, device_id, scan_result, scanned_at, is_offline
  )
  VALUES (v_qr.id, v_qr.event_id, auth.uid(), p_device_id, v_scan_result, now(), false);

  IF v_scan_result <> 'valid' THEN
    RETURN jsonb_build_object('success', false, 'error_code', upper(v_scan_result));
  END IF;

  UPDATE public.qr_codes
  SET status = 'used', used_at = now()
  WHERE id = v_qr.id;

  CASE v_qr.entity_type
    WHEN 'ticket' THEN
      UPDATE public.tickets SET status = 'used' WHERE id = v_qr.entity_id AND status = 'active';
    WHEN 'table_reservation' THEN
      UPDATE public.table_reservations SET status = 'used' WHERE id = v_qr.entity_id AND status = 'confirmed';
    WHEN 'seat_reservation' THEN
      UPDATE public.seat_reservations SET status = 'used' WHERE id = v_qr.entity_id AND status = 'confirmed';
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_QR_ENTITY_TYPE: %', v_qr.entity_type;
  END CASE;

  RETURN jsonb_build_object('success', true, 'qr_code_id', v_qr.id, 'scan_result', v_scan_result);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 9/17 — transfer_reservation_atomic
-- Authority is auth.uid() only; there is no from_user parameter (spec §12).
--
-- History-preserving model: the surrendered row moves to `transferred` and a
-- fresh active row is created for the recipient, so the original holder's record
-- is never rewritten. orders / order_items / order_item_selections are untouched
-- (spec §13): the new row reuses the original order_id and order_item_id.
-- The new entity is reachable from the transfer log through
-- reservation_transfers.new_qr_code_id -> qr_codes.entity_id, because
-- reservation_transfers has no column for a new entity id.
--
-- RECIPIENT RESOLUTION IS OUT OF SCOPE FOR THIS FUNCTION.
-- p_recipient_profile_id must already be a resolved profiles.id, supplied by a
-- trusted application layer. This function only verifies that the id exists and
-- is not the caller; it cannot look a recipient up by e-mail, phone or handle.
-- That is deliberate: the profiles RLS policy exposes own rows only, no general
-- profile/e-mail search policy exists, and the RPC surface is locked at 17
-- functions — so no searchable recipient directory is reachable from a client.
-- Turning an e-mail or phone number into a profile id (and the invite flow for
-- recipients who have no profile yet) is a separate product decision and must be
-- designed before an end-user transfer UI can call this RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_reservation_atomic(
  p_entity_type text,
  p_entity_id uuid,
  p_recipient_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_old_qr_id uuid;
  v_new_qr_id uuid;
  v_new_entity_id uuid;
  v_transfer_id uuid;
  v_ticket public.tickets%ROWTYPE;
  v_table public.table_reservations%ROWTYPE;
  v_seat public.seat_reservations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF p_recipient_profile_id IS NULL OR p_recipient_profile_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TARGET_USER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient_profile_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TARGET_USER_NOT_FOUND');
  END IF;

  -- Load and lock the surrendered row; ownership is part of the predicate.
  CASE p_entity_type
    WHEN 'ticket' THEN
      SELECT * INTO v_ticket
      FROM public.tickets
      WHERE id = p_entity_id AND holder_id = v_user_id AND status = 'active'
      FOR UPDATE;
      v_event_id := v_ticket.event_id;
      v_old_qr_id := v_ticket.qr_code_id;
    WHEN 'table_reservation' THEN
      SELECT * INTO v_table
      FROM public.table_reservations
      WHERE id = p_entity_id AND customer_id = v_user_id AND status = 'confirmed'
      FOR UPDATE;
      v_event_id := v_table.event_id;
      v_old_qr_id := v_table.qr_code_id;
    WHEN 'seat_reservation' THEN
      SELECT * INTO v_seat
      FROM public.seat_reservations
      WHERE id = p_entity_id AND customer_id = v_user_id AND status = 'confirmed'
      FOR UPDATE;
      v_event_id := v_seat.event_id;
      v_old_qr_id := v_seat.qr_code_id;
    ELSE
      RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ENTITY_TYPE');
  END CASE;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_TRANSFERABLE');
  END IF;

  IF v_old_qr_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'QR_MISSING');
  END IF;

  UPDATE public.qr_codes
  SET status = 'revoked', revoked_at = now()
  WHERE id = v_old_qr_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'QR_NOT_ACTIVE');
  END IF;

  -- Retire the old row first: the sold-resource partial unique indexes exclude
  -- `transferred`, so the recipient row can then be inserted as confirmed.
  CASE p_entity_type
    WHEN 'ticket' THEN
      UPDATE public.tickets SET status = 'transferred' WHERE id = p_entity_id;

      INSERT INTO public.tickets (
        event_id, ticket_type_id, zone_id, order_id, order_item_id,
        holder_id, status, confirmed_at
      )
      VALUES (
        v_ticket.event_id, v_ticket.ticket_type_id, v_ticket.zone_id,
        v_ticket.order_id, v_ticket.order_item_id,
        p_recipient_profile_id, 'active', v_ticket.confirmed_at
      )
      RETURNING id INTO v_new_entity_id;

    WHEN 'table_reservation' THEN
      UPDATE public.table_reservations SET status = 'transferred' WHERE id = p_entity_id;

      INSERT INTO public.table_reservations (
        event_id, table_id, event_table_id, package_id, order_id, order_item_id,
        customer_id, status, guest_count,
        snapshot_base_price, snapshot_package_name,
        snapshot_total_amount, snapshot_deposit_amount, snapshot_remaining_amount,
        venue_collected_amount, venue_collected_at, financial_status, confirmed_at
      )
      VALUES (
        v_table.event_id, v_table.table_id, v_table.event_table_id, v_table.package_id,
        v_table.order_id, v_table.order_item_id,
        p_recipient_profile_id, 'confirmed', v_table.guest_count,
        v_table.snapshot_base_price, v_table.snapshot_package_name,
        v_table.snapshot_total_amount, v_table.snapshot_deposit_amount,
        v_table.snapshot_remaining_amount,
        v_table.venue_collected_amount, v_table.venue_collected_at,
        v_table.financial_status, v_table.confirmed_at
      )
      RETURNING id INTO v_new_entity_id;

    WHEN 'seat_reservation' THEN
      UPDATE public.seat_reservations SET status = 'transferred' WHERE id = p_entity_id;

      INSERT INTO public.seat_reservations (
        event_id, seat_id, order_id, order_item_id,
        customer_id, status, snapshot_price, confirmed_at
      )
      VALUES (
        v_seat.event_id, v_seat.seat_id, v_seat.order_id, v_seat.order_item_id,
        p_recipient_profile_id, 'confirmed', v_seat.snapshot_price, v_seat.confirmed_at
      )
      RETURNING id INTO v_new_entity_id;
  END CASE;

  INSERT INTO public.qr_codes (token, entity_type, entity_id, event_id, holder_id, status, issued_at)
  VALUES (
    encode(extensions.gen_random_bytes(32), 'hex'),
    p_entity_type, v_new_entity_id, v_event_id, p_recipient_profile_id, 'active', now()
  )
  RETURNING id INTO v_new_qr_id;

  -- Only qr_code_id is written here, so no 033 status guard is triggered.
  CASE p_entity_type
    WHEN 'ticket' THEN
      UPDATE public.tickets SET qr_code_id = v_new_qr_id WHERE id = v_new_entity_id;
    WHEN 'table_reservation' THEN
      UPDATE public.table_reservations SET qr_code_id = v_new_qr_id WHERE id = v_new_entity_id;
    WHEN 'seat_reservation' THEN
      UPDATE public.seat_reservations SET qr_code_id = v_new_qr_id WHERE id = v_new_entity_id;
  END CASE;

  INSERT INTO public.reservation_transfers (
    entity_type, entity_id, from_user_id, to_user_id, initiated_by, old_qr_code_id, new_qr_code_id
  )
  VALUES (
    p_entity_type, p_entity_id, v_user_id, p_recipient_profile_id, v_user_id, v_old_qr_id, v_new_qr_id
  )
  RETURNING id INTO v_transfer_id;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'transferred_entity_id', p_entity_id,
    'new_entity_id', v_new_entity_id,
    'new_qr_code_id', v_new_qr_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 10/17 — publish_event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status = 'published' THEN
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'noop', true);
  END IF;

  IF v_event.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  SELECT * INTO v_owner FROM public.profiles WHERE id = v_event.owner_id;
  IF v_owner.account_type NOT IN ('venue_owner', 'organizer')
     OR v_owner.verification_status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'OWNER_NOT_ELIGIBLE');
  END IF;

  -- Zone / type consistency (spec §5 zone mode rules)
  IF EXISTS (
    SELECT 1 FROM public.event_ticket_zones AS z
    WHERE z.event_id = p_event_id
      AND z.is_active
      AND z.sale_mode = 'ticket_based'
      AND NOT EXISTS (
        SELECT 1 FROM public.event_ticket_types AS t
        WHERE t.zone_id = z.id AND t.is_active
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_ZONE_WITHOUT_TYPE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_ticket_zones AS z
    WHERE z.event_id = p_event_id
      AND z.is_active
      AND z.sale_mode = 'seat_based'
      AND NOT EXISTS (
        SELECT 1 FROM public.event_seat_pricing AS sp
        WHERE sp.zone_id = z.id
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'SEAT_ZONE_WITHOUT_PRICING');
  END IF;

  UPDATE public.events
  SET status = 'published', updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'publish_event', 'event', p_event_id, jsonb_build_object('status', 'published'));

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 11/17 — postpone_event (spec §7.2)
-- starts_at / ends_at are never modified; rescheduling is a separate RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.postpone_event(
  p_event_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_order RECORD;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status = 'postponed' THEN
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id, 'noop', true);
  END IF;

  IF v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  -- starts_at / ends_at are NOT modified (spec §6.1)
  UPDATE public.events
  SET status = 'postponed', updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.event_schedule_changes (
    event_id, change_type,
    previous_status, new_status,
    previous_starts_at, previous_ends_at,
    new_starts_at, new_ends_at,
    reason, changed_by
  )
  VALUES (
    p_event_id, 'postpone',
    v_event.status, 'postponed',
    v_event.starts_at, v_event.ends_at,
    v_event.starts_at, v_event.ends_at,
    p_reason, auth.uid()
  );

  -- Cleanup of pending records; paid/confirmed rows are preserved
  FOR v_order IN
    SELECT id FROM public.orders
    WHERE event_id = p_event_id AND status = 'pending_payment'
    FOR UPDATE
  LOOP
    PERFORM public.expire_order_atomic(v_order.id);
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (
    auth.uid(), 'postpone_event', 'event', p_event_id,
    jsonb_build_object('status', 'postponed', 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 12/17 — reschedule_event (spec §7.3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_event(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_starts_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STARTS_AT_REQUIRED');
  END IF;

  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_TIME_RANGE');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND');
  END IF;

  IF v_event.status NOT IN ('postponed', 'published') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE');
  END IF;

  UPDATE public.events
  SET starts_at = p_starts_at,
      ends_at = p_ends_at,
      status = 'published',
      updated_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.event_schedule_changes (
    event_id, change_type,
    previous_status, new_status,
    previous_starts_at, previous_ends_at,
    new_starts_at, new_ends_at,
    changed_by
  )
  VALUES (
    p_event_id, 'reschedule',
    v_event.status, 'published',
    v_event.starts_at, v_event.ends_at,
    p_starts_at, p_ends_at,
    auth.uid()
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    auth.uid(), 'reschedule_event', 'event', p_event_id,
    jsonb_build_object('starts_at', v_event.starts_at, 'ends_at', v_event.ends_at, 'status', v_event.status),
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'status', 'published')
  );

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 13/17 — upsert_event_ticket_type
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_event_ticket_type(
  p_event_id uuid,
  p_zone_id uuid,
  p_name text,
  p_price numeric,
  p_description text DEFAULT NULL,
  p_max_per_order int DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_ticket_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone public.event_ticket_zones%ROWTYPE;
  v_id uuid := p_ticket_type_id;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NAME_REQUIRED');
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = p_zone_id;
  IF NOT FOUND OR v_zone.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
  END IF;

  IF v_zone.sale_mode <> 'ticket_based' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_SALE_MODE');
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.event_ticket_types (
      event_id, zone_id, name, price, description, max_per_order, is_active
    )
    VALUES (p_event_id, p_zone_id, p_name, p_price, p_description, p_max_per_order, p_is_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.event_ticket_types
    SET zone_id = p_zone_id,
        name = p_name,
        price = p_price,
        description = p_description,
        max_per_order = p_max_per_order,
        is_active = p_is_active
    WHERE id = v_id AND event_id = p_event_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'ticket_type_id', v_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 14/17 — upsert_event_seat_pricing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_event_seat_pricing(
  p_event_id uuid,
  p_seat_id uuid,
  p_zone_id uuid,
  p_price numeric,
  p_deposit_amount numeric DEFAULT NULL,
  p_is_sellable boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone public.event_ticket_zones%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PRICE');
  END IF;

  SELECT * INTO v_zone FROM public.event_ticket_zones WHERE id = p_zone_id;
  IF NOT FOUND OR v_zone.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ZONE_NOT_FOUND');
  END IF;

  IF v_zone.sale_mode <> 'seat_based' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_SALE_MODE');
  END IF;

  INSERT INTO public.event_seat_pricing (
    event_id, seat_id, zone_id, price, deposit_amount, is_sellable
  )
  VALUES (p_event_id, p_seat_id, p_zone_id, p_price, p_deposit_amount, p_is_sellable)
  ON CONFLICT (event_id, seat_id) DO UPDATE
    SET zone_id = EXCLUDED.zone_id,
        price = EXCLUDED.price,
        deposit_amount = EXCLUDED.deposit_amount,
        is_sellable = EXCLUDED.is_sellable
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'seat_pricing_id', v_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 15/17 — block_event_resource
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_event_resource(
  p_event_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_block_type text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_manage_event(p_event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF p_resource_type NOT IN ('table', 'seat') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_RESOURCE_TYPE');
  END IF;

  IF p_block_type NOT IN ('protocol', 'vip_guest', 'technical', 'out_of_service', 'business_use') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_BLOCK_TYPE');
  END IF;

  IF p_resource_type = 'seat' AND EXISTS (
    SELECT 1 FROM public.seat_reservations
    WHERE event_id = p_event_id AND seat_id = p_resource_id
      AND status IN ('confirmed', 'used', 'transferred')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESOURCE_ALREADY_SOLD');
  END IF;

  IF p_resource_type = 'table' AND EXISTS (
    SELECT 1 FROM public.table_reservations
    WHERE event_id = p_event_id AND table_id = p_resource_id
      AND status IN ('confirmed', 'used', 'transferred')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESOURCE_ALREADY_SOLD');
  END IF;

  INSERT INTO public.event_resource_blocks (
    event_id, resource_type, resource_id, block_type, reason, blocked_by, is_active
  )
  VALUES (p_event_id, p_resource_type, p_resource_id, p_block_type, p_reason, auth.uid(), true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'block_id', v_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 16/17 — deactivate_package
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_package(p_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package public.table_packages%ROWTYPE;
BEGIN
  SELECT * INTO v_package FROM public.table_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PACKAGE_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_event(v_package.event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF NOT v_package.is_active THEN
    RETURN jsonb_build_object('success', true, 'package_id', p_package_id, 'noop', true);
  END IF;

  UPDATE public.table_packages
  SET is_active = false, updated_at = now()
  WHERE id = p_package_id;

  RETURN jsonb_build_object('success', true, 'package_id', p_package_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 17/17 — mark_venue_collected_atomic
-- Spec §8.5: touches only venue_collected_amount / venue_collected_at /
-- financial_status. payment_line_items is NOT written.
-- financial_status walks the linear chain (§6.6) one step at a time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_venue_collected_atomic(
  p_reservation_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.table_reservations%ROWTYPE;
  v_outstanding numeric(12, 2);
  v_new_collected numeric(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO v_res FROM public.table_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND');
  END IF;

  IF NOT public.can_settle_event(v_res.event_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN');
  END IF;

  IF v_res.financial_status NOT IN ('online_paid', 'partially_collected_at_venue') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_FINANCIAL_STATE');
  END IF;

  v_outstanding := COALESCE(v_res.snapshot_remaining_amount, 0) - COALESCE(v_res.venue_collected_amount, 0);
  IF p_amount > v_outstanding THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'AMOUNT_EXCEEDS_REMAINING');
  END IF;

  v_new_collected := COALESCE(v_res.venue_collected_amount, 0) + p_amount;

  UPDATE public.table_reservations
  SET venue_collected_amount = v_new_collected,
      venue_collected_at = now()
  WHERE id = p_reservation_id;

  IF v_res.financial_status = 'online_paid' THEN
    UPDATE public.table_reservations
    SET financial_status = 'partially_collected_at_venue'
    WHERE id = p_reservation_id;
  END IF;

  IF v_new_collected >= COALESCE(v_res.snapshot_remaining_amount, 0) THEN
    UPDATE public.table_reservations
    SET financial_status = 'venue_balance_settled'
    WHERE id = p_reservation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'venue_collected_amount', v_new_collected
  );
END;
$$;

-- ===========================================================================
-- SECTION 10 — RPC execution grants
-- ===========================================================================

REVOKE ALL ON FUNCTION public.create_mixed_cart_atomic(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ticket_capacity_atomic(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_seat_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_table_atomic(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_order_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_payment_atomic(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.use_qr_atomic(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_reservation_atomic(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.postpone_event(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_event(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_ticket_type(uuid, uuid, text, numeric, text, int, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_event_seat_pricing(uuid, uuid, uuid, numeric, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_event_resource(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_package(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_venue_collected_atomic(uuid, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_mixed_cart_atomic(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ticket_capacity_atomic(uuid, uuid, uuid, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_seat_atomic(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_table_atomic(uuid, uuid, uuid, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_order_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_qr_atomic(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_reservation_atomic(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.postpone_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_event(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_ticket_type(uuid, uuid, text, numeric, text, int, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_seat_pricing(uuid, uuid, uuid, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_event_resource(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_venue_collected_atomic(uuid, numeric) TO authenticated;

-- Payment confirmation / failure is a server-side webhook path only.
-- Deliberately NOT granted to authenticated: a customer must never self-confirm.
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(uuid, text, text, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_atomic(uuid, text, text, text) TO service_role;

-- ===========================================================================
-- SECTION 11 — Partial unique indexes (concurrency guarantees, spec §9)
-- ===========================================================================

CREATE UNIQUE INDEX resource_locks_event_resource_active_unique
  ON public.resource_locks (event_id, resource_type, resource_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX seat_reservations_event_seat_sold_unique
  ON public.seat_reservations (event_id, seat_id)
  WHERE status IN ('confirmed', 'used');

CREATE UNIQUE INDEX table_reservations_event_table_sold_unique
  ON public.table_reservations (event_id, table_id)
  WHERE status IN ('confirmed', 'used');

-- ===========================================================================
-- SECTION 12 — Performance indexes
-- ===========================================================================

CREATE INDEX profiles_account_type_idx ON public.profiles (account_type);
CREATE INDEX profiles_verification_status_idx ON public.profiles (verification_status);

CREATE INDEX venues_owner_id_idx ON public.venues (owner_id);
CREATE INDEX venue_areas_venue_id_idx ON public.venue_areas (venue_id);
CREATE INDEX venue_tables_venue_id_idx ON public.venue_tables (venue_id);
CREATE INDEX venue_seats_venue_id_idx ON public.venue_seats (venue_id);

CREATE INDEX events_owner_id_idx ON public.events (owner_id);
CREATE INDEX events_venue_id_idx ON public.events (venue_id);
CREATE INDEX events_status_starts_at_idx ON public.events (status, starts_at);
CREATE INDEX events_category_idx ON public.events (category);

CREATE INDEX event_schedule_changes_event_id_created_at_idx
  ON public.event_schedule_changes (event_id, created_at);
CREATE INDEX event_schedule_changes_changed_by_idx
  ON public.event_schedule_changes (changed_by);

CREATE INDEX event_formats_event_id_idx ON public.event_formats (event_id);
CREATE INDEX event_artists_event_id_idx ON public.event_artists (event_id);
CREATE INDEX event_artists_artist_id_idx ON public.event_artists (artist_id);
CREATE INDEX event_venue_contacts_venue_id_idx ON public.event_venue_contacts (venue_id);

CREATE INDEX event_ticket_zones_event_id_idx ON public.event_ticket_zones (event_id);
CREATE INDEX event_ticket_types_event_id_idx ON public.event_ticket_types (event_id);
CREATE INDEX event_ticket_types_zone_id_idx ON public.event_ticket_types (zone_id);
CREATE INDEX event_seat_pricing_event_id_idx ON public.event_seat_pricing (event_id);
CREATE INDEX event_seat_pricing_zone_id_idx ON public.event_seat_pricing (zone_id);
CREATE INDEX event_seat_pricing_seat_id_idx ON public.event_seat_pricing (seat_id);
CREATE INDEX event_tables_event_id_idx ON public.event_tables (event_id);
CREATE INDEX event_tables_table_id_idx ON public.event_tables (table_id);

CREATE INDEX event_resource_blocks_event_resource_idx
  ON public.event_resource_blocks (event_id, resource_type, resource_id)
  WHERE is_active = true;

CREATE INDEX table_packages_event_id_idx ON public.table_packages (event_id);
CREATE INDEX table_packages_event_table_id_idx ON public.table_packages (event_table_id);
CREATE INDEX package_items_package_id_idx ON public.package_items (package_id);
CREATE INDEX package_item_options_package_item_id_idx ON public.package_item_options (package_item_id);
CREATE INDEX package_upgrades_package_id_idx ON public.package_upgrades (package_id);
CREATE INDEX package_upgrade_options_upgrade_id_idx ON public.package_upgrade_options (upgrade_id);

CREATE INDEX bus_routes_event_id_idx ON public.bus_routes (event_id);
CREATE INDEX bus_stops_route_id_idx ON public.bus_stops (route_id);
CREATE INDEX bus_return_times_route_id_idx ON public.bus_return_times (route_id);

CREATE INDEX orders_customer_id_idx ON public.orders (customer_id);
CREATE INDEX orders_event_id_idx ON public.orders (event_id);
CREATE INDEX orders_status_expires_at_idx ON public.orders (status, expires_at);
CREATE INDEX order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX order_item_selections_order_item_id_idx ON public.order_item_selections (order_item_id);

CREATE INDEX resource_locks_order_id_idx ON public.resource_locks (order_id);
CREATE INDEX resource_locks_expires_at_idx ON public.resource_locks (expires_at) WHERE status = 'active';

CREATE INDEX tickets_order_id_idx ON public.tickets (order_id);
CREATE INDEX tickets_holder_id_idx ON public.tickets (holder_id);
CREATE INDEX tickets_event_status_idx ON public.tickets (event_id, status);
CREATE INDEX tickets_zone_id_idx ON public.tickets (zone_id);

CREATE INDEX table_reservations_order_id_idx ON public.table_reservations (order_id);
CREATE INDEX table_reservations_customer_id_idx ON public.table_reservations (customer_id);
CREATE INDEX table_reservations_event_status_idx ON public.table_reservations (event_id, status);
CREATE INDEX table_reservations_financial_status_idx ON public.table_reservations (financial_status);

CREATE INDEX seat_reservations_order_id_idx ON public.seat_reservations (order_id);
CREATE INDEX seat_reservations_customer_id_idx ON public.seat_reservations (customer_id);
CREATE INDEX seat_reservations_event_status_idx ON public.seat_reservations (event_id, status);

CREATE INDEX payments_order_id_idx ON public.payments (order_id);
CREATE INDEX payments_provider_payment_id_idx ON public.payments (provider_payment_id);
CREATE INDEX payment_line_items_payment_id_idx ON public.payment_line_items (payment_id);
CREATE INDEX payment_line_items_reference_idx ON public.payment_line_items (reference_type, reference_id);
CREATE INDEX deposits_order_id_idx ON public.deposits (order_id);
CREATE INDEX deposits_reservation_idx ON public.deposits (reservation_type, reservation_id);
CREATE INDEX tax_line_items_payment_line_item_id_idx ON public.tax_line_items (payment_line_item_id);
CREATE INDEX commission_records_event_id_idx ON public.commission_records (event_id);
CREATE INDEX commission_records_owner_id_idx ON public.commission_records (owner_id);
CREATE INDEX settlement_records_recipient_id_idx ON public.settlement_records (recipient_id);
CREATE INDEX refund_records_order_id_idx ON public.refund_records (order_id);

CREATE INDEX qr_codes_event_id_idx ON public.qr_codes (event_id);
CREATE INDEX qr_codes_holder_id_idx ON public.qr_codes (holder_id);
CREATE INDEX qr_codes_entity_idx ON public.qr_codes (entity_type, entity_id);
CREATE INDEX qr_scan_logs_qr_code_id_idx ON public.qr_scan_logs (qr_code_id);
CREATE INDEX qr_scan_logs_event_scanned_at_idx ON public.qr_scan_logs (event_id, scanned_at);

CREATE INDEX notifications_user_id_idx ON public.notifications (user_id);
CREATE INDEX notifications_status_scheduled_at_idx ON public.notifications (status, scheduled_at);
CREATE INDEX notifications_event_reference_idx ON public.notifications (event_id, reference_type, reference_id);
CREATE INDEX notification_deliveries_notification_id_idx ON public.notification_deliveries (notification_id);

CREATE INDEX social_links_entity_idx ON public.social_links (entity_type, entity_id);
CREATE INDEX follows_target_idx ON public.follows (target_type, target_id);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_id_created_at_idx ON public.audit_logs (actor_id, created_at);
