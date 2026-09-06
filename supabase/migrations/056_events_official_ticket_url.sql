-- Migration 056 — events.official_ticket_url (additive only)
-- Scope: nullable public.events.official_ticket_url + revoke client INSERT/UPDATE
--         on that column.
-- Purpose: unblock discovery SELECT (PostgREST) without replaying 051–055 and
--          without changing staging organizer/auth/lifecycle/audit models.
-- Depends on: public.events exists.
-- Does NOT add: RPCs, artist writes, admin_audit_log, venue_actor_role,
--               event_owner_is_eligible, publish/review lifecycle, other tables.
-- Does NOT modify: migrations 001–055 files.
-- URL is NOT required to publish.

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS official_ticket_url text NULL;

COMMENT ON COLUMN public.events.official_ticket_url IS
  'External official ticket page URL. Nullable. Not required to publish. Client INSERT/UPDATE revoked; writes only via controlled server/RPC paths when added.';

REVOKE UPDATE (official_ticket_url) ON TABLE public.events
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT (official_ticket_url) ON TABLE public.events
  FROM PUBLIC, anon, authenticated;

COMMIT;
