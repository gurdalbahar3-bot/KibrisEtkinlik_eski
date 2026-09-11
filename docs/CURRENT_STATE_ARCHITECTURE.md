# Current State Architecture

**As of:** August 2026  
**Migrations:** 001–047 applied (immutable)  
**Baseline:** Master Architecture V1 audit approved

---

## 1. System overview

KibrisEtkinlik is a **database-first** platform. The authoritative business layer is PostgreSQL with RLS and SECURITY DEFINER RPCs. There is no application server or frontend yet.

```
┌─────────────────────────────────────────────────┐
│  Future: Next.js (public, organizer, venue)     │
├─────────────────────────────────────────────────┤
│  Future: Next.js API routes + domain services   │
├─────────────────────────────────────────────────┤
│  Supabase PostgREST + Auth                      │
├─────────────────────────────────────────────────┤
│  PostgreSQL RPCs (100+) + RLS                   │
├─────────────────────────────────────────────────┤
│  ~70 domain tables                              │
└─────────────────────────────────────────────────┘
```

---

## 2. Domain inventory

### Identity
- `profiles`, `customer_profiles`, `venue_owner_profiles`, `organizer_profiles`, `super_admin_profiles`
- `roles`, `role_permissions` (seeded; permissions not yet active in auth helpers)
- `account_applications`

### Venue / layout
- `venues`, `venue_areas` (Venue Space foundation)
- `venue_tables`, `venue_seats`
- `venue_layout_objects` (042), `event_layout_overrides` (044)

### Event
- `events`, `event_formats`, `event_locations`, `event_venue_contacts`
- `event_artists`, `wedding_details`, `event_schedule_changes`

### Commerce / inventory
- `event_ticket_zones`, `event_ticket_types`, `event_seat_pricing`
- `event_tables`, `table_packages`, `package_items`, `package_item_options`
- `package_upgrades`, `package_upgrade_options`, `event_sale_categories`
- `event_resource_blocks`

### Orders / reservations
- `orders`, `order_items`, `order_item_selections` (table exists; checkout does not write selections yet)
- `resource_locks`, `tickets`, `seat_reservations`, `table_reservations`
- `reservation_transfers`, `entry_passes`

### Payments / finance
- `payments`, `payment_line_items`, `deposits`, `tax_line_items`
- `commission_records`, `settlement_records`, `refund_records`
- Currency: `numeric(12,2)` + `currency text` (no `amount_minor` yet)

### Operations
- `qr_codes`, `qr_scan_logs`
- `check_in_lists`, `check_in_gates`, `check_in_events`, `check_in_devices`
- `staff_invitations`, `staff_assignments`, `event_staff_permissions`, `staff_devices`

### Other
- `artists`, `notifications`, `social_links`, `follows`
- `audit_logs`, `featured_listings` (shell), `bus_routes` / stops / return times
- `offline_scan_queue`, `offline_event_snapshots` (placeholders)

---

## 3. Authorization model (current)

| Helper | Purpose |
|--------|---------|
| `is_super_admin()` | Platform admin |
| `owns_venue()`, `owns_event()` | Direct ownership |
| `event_is_published()` | Public read gate |
| `has_event_staff_role()`, `has_event_staff_access()` | Event staff |
| `can_manage_event()` | Catalog, pricing, packages, metadata |
| `can_scan_event()` | Door QR |
| `can_settle_event()` | Finance/settlement |
| `can_operate_event()` | Field operations (039) |

**Tenant model today:** user-owned events/venues (`owner_id`). No `organizations` table yet.

---

## 4. RPC inventory (by migration group)

### 034 — Core checkout & lifecycle
- `reserve_ticket_capacity_atomic`, `reserve_seat_atomic`, `reserve_table_atomic`
- `create_mixed_cart_atomic`, `expire_order_atomic`
- `confirm_payment_atomic`, `fail_payment_atomic`
- `use_qr_atomic`, `transfer_reservation_atomic`
- `publish_event`, `postpone_event`, `reschedule_event`
- Legacy: `upsert_event_ticket_type`, `upsert_event_seat_pricing`, `block_event_resource`, `deactivate_package`, `mark_venue_collected_atomic`

### 040–041 — Admission & check-in
- Entry pass issuance, table reservation admission
- Check-in lists, gates, devices, events

### 043–044 — Layout
- Venue layout object CRUD, event layout overrides

### 045 — Event commerce setup
- `upsert/deactivate_event_ticket_zone_atomic`
- `upsert/deactivate_table_package_atomic`
- `block/unblock_event_resource_atomic`
- `delete_event_seat_pricing_atomic`, `save_event_seat_pricing_batch_atomic`

### 046 — Package catalog
- Package item/option/upgrade CRUD (atomic)
- `upsert/deactivate_event_sale_category_atomic`

### 047 — Event core metadata
- `upsert/delete_event_format_atomic`
- `upsert/delete_event_location_atomic`
- `upsert/delete_event_venue_contact_atomic`
- `upsert/delete_event_wedding_details_atomic`

---

## 5. Known gaps (approved for 048+)

| Gap | Planned migration |
|-----|-------------------|
| Organization multi-tenancy | 048 |
| KKTC 6-district canonical model | 049 |
| Package checkout selections | 050 |
| RBAC activation | 051 |
| Payment webhook idempotency | 052 |
| Reservation state extension | 053 |
| Event status extension | 054 |
| Staff management RPCs | 055 |
| Shared table inventory | 056 |
| i18n, SEO, analytics, discovery, social, AI | 057–063 |
| Domain outbox, amount_minor | 064–065 |

---

## 6. Currency & locale

- **Primary currency:** TRY / TL (not enforced at schema default yet)
- **Representation:** `numeric(12,2)` — `amount_minor` planned in 065
- **Locale:** No i18n tables yet; TR/EN planned in 057

---

## 7. Location model (current)

- `venues.city`, `venues.region` — free text
- `event_locations.city`, `event_locations.region` — free text
- No canonical KKTC district entities (049 will add)

---

## 8. Venue multi-space

Reuse `venues` → `venue_areas` → `venue_tables` / `venue_seats`.  
Do not introduce a parallel "spaces" system.

---

## 9. Central inventory

Authoritative inventory flows through:
- `resource_locks` (holds)
- Reservation/ticket tables
- `entry_passes` (M8 admission)
- Atomic checkout RPCs with `FOR UPDATE`

Social channels are **not** inventory sources of truth.

---

## 9b. Reservation MVP (tables) — locked product rules

| Topic | Rule |
|-------|------|
| Online hold | **Exclusive** per `(event, table)` via active `resource_locks`. Second concurrent hold → `TABLE_LOCKED`. |
| Shared table capacity | Applies **after confirmation** using `entry_passes` on confirmed/used reservations (effective capacity = `event_tables.max_guests` ?? `venue_tables.capacity`). Example: capacity 10 with groups 3+4+2+1 = full. |
| Concurrent shared holds | **Not** in MVP (would need capacity-aware locks / migration). |
| Package soft deactivate | `table_packages.is_active=false` via `upsert_table_package_atomic`. Catalog edits do **not** rewrite historical `order_items` snapshot prices. Inactive packages are excluded from new checkout (`is_active=true` filter). |
| Event table / package mutations | **Draft-only** in the app (same gate as ticket commerce via `requireOwnedDraftEvent`). RPCs remain `can_manage_event`; published events reject enable/edit with `not_draft`. |
| Customer capacity display | Prefer `entry_passes` when the read succeeds; otherwise fall back to confirmed/used `table_reservations.guest_count`. Source is exposed as `capacitySource`. Guest count is never trusted for inventory — `reserve_table_atomic` / `check_table_capacity_available` enforce limits. |
| Concurrency | DB `FOR UPDATE` + unique active lock + capacity check. Client availability is advisory only. |
| Currency | TRY/TL primary; deposit `amount_due_now` from package catalog. |

---

## 9c. Public discovery (B8–B12)

| Topic | Rule |
|-------|------|
| Public list pool | `published` \| `postponed` only (`DISCOVERY_LIST_STATUSES`) + Cyprus date ≥ today. |
| Detail deep-link | Also allows `completed` (`PUBLIC_EVENT_STATUSES`). Draft / in_review / approved / unpublished / cancelled never public. |
| District hubs | Canonical 6 slugs under `/tr/etkinlikler/{district}` and `/en/events/{district}`. |
| Filters | Server-side over discovery pool: q, date presets, from/to, district, category, venue slug, free/paid, tickets/reservation, page. |
| Commerce enrichment | One batched ticket + package index per request (`loadDiscoveryCommerceIndex`) — no N+1 per card. |
| CTAs | Safe detail/checkout links only; ledger/payment never client-trusted. Hybrid = ticket + reservation. |
| SEO | Per-event + district canonical, hreflang, OG/Twitter, JSON-LD Event; sitemap from discovery facade only. |

---

## 10. Historical reference

[`FAZ_0_v1.3_FINAL_LOCKED_SPEC.md`](FAZ_0_v1.3_FINAL_LOCKED_SPEC.md) documents the original 034-era design. Treat it as historical unless explicitly superseded by [`MASTER_ARCHITECTURE_V1_GOVERNANCE.md`](MASTER_ARCHITECTURE_V1_GOVERNANCE.md).
