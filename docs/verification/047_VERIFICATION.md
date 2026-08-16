# Migration 047 — Verification Record

**Date:** August 2026  
**Status:** VERIFIED — applied to remote database  
**Git commit:** See repository log for `feat: add event core metadata setup`

---

## File integrity

| Check | Value |
|-------|-------|
| Path | `supabase/migrations/047_event_core_metadata_setup.sql` |
| Lines | 598 |
| Size | 18,735 bytes |
| Transaction | BEGIN … COMMIT |
| Alters 001–046 | No |

---

## Functions deployed

### Internal (REVOKE PUBLIC, not granted to authenticated)

- `event_metadata_assert_format_in_event(uuid, uuid)`
- `event_metadata_assert_contact_in_event(uuid, uuid)`

### Public RPCs (GRANT authenticated)

- `upsert_event_format_atomic`
- `delete_event_format_atomic`
- `upsert_event_location_atomic`
- `delete_event_location_atomic`
- `upsert_event_venue_contact_atomic`
- `delete_event_venue_contact_atomic`
- `upsert_event_wedding_details_atomic`
- `delete_event_wedding_details_atomic`

---

## Behavioral locks (design)

- Auth: `can_manage_event` — no draft-only gate
- `p_venue_id` must match `events.venue_id` → `VENUE_EVENT_MISMATCH`
- Wedding upsert requires `events.is_wedding = true` → `NOT_WEDDING_EVENT`
- Location UPDATE: effective coordinate validation (COALESCE input, existing)
- Contact update: does not reset `verification_status` / `verified_at`
- No ALTER TABLE, no RLS policy changes, no events DML

---

## Dependencies

- 011 (events)
- 012 (event_formats, event_locations, event_venue_contacts)
- 019 (wedding_details)
- 034 (can_manage_event, RLS)

---

## Post-apply verification (remote)

Performed after initial apply; re-verified at Phase 0:

- 10/10 functions present
- Security pattern: REVOKE PUBLIC + GRANT authenticated on public RPCs
- IDOR: unauthorized caller rejected
- Coordinate PATCH: effective lat/lon validation active

---

## Repository consistency

047 SQL file committed without modification for "cleaner" commit.  
Local file matches intended applied state.
