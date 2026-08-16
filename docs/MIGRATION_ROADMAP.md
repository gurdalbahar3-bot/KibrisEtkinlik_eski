# Migration Roadmap (048+)

**Baseline:** Migrations 001–047 immutable and applied.  
**Governance:** [`MASTER_ARCHITECTURE_V1_GOVERNANCE.md`](MASTER_ARCHITECTURE_V1_GOVERNANCE.md)

---

## Phase 0 — Governance ✅

| Task | Status |
|------|--------|
| Verify 047 state | Done |
| Commit 047 to Git | Done |
| Update README | Done |
| Current-state architecture doc | Done |
| Master Architecture V1 governance record | Done |
| Migration roadmap | This document |
| 048 / 049 detailed plans | [`plans/`](plans/) |
| Next.js scaffold plan | [`plans/NEXTJS_SCAFFOLD_PLAN.md`](plans/NEXTJS_SCAFFOLD_PLAN.md) |
| Payment adapter design | [`plans/PAYMENT_ADAPTER_DESIGN.md`](plans/PAYMENT_ADAPTER_DESIGN.md) |
| Test strategy | [`plans/TEST_STRATEGY.md`](plans/TEST_STRATEGY.md) |

**Do not execute 048 until Phase 0 is reviewed.**

---

## Phase 1 — Foundation (048–052)

| # | Migration | Purpose | Depends on |
|---|-----------|---------|------------|
| 048 | `organizations_foundation` | Tenant boundary, memberships, staged org FK | — |
| 049 | `kktc_location_model` | 6 KKTC districts, neighborhood optional | 048 |
| 050 | `checkout_package_selections` | Write `order_item_selections` in checkout | 046 |
| 051 | `rbac_activation` | Wire `role_permissions` into auth helpers | 048 |
| 052 | `payment_webhook_idempotency` | Webhook dedup, idempotency keys | — |

**Exit criteria:** Org context works; districts seeded; package checkout persists selections; payment schema idempotent; RLS tenant tests pass.

---

## Phase 2 — Commerce & operations (053–056)

| # | Migration | Purpose |
|---|-----------|---------|
| 053 | `reservation_state_extension` | CHECKED_IN, NO_SHOW, EXPIRED (compatible) |
| 054 | `event_status_extension` | unpublished/rescheduled semantics (compatible) |
| 055 | `staff_management_rpcs` | Invite, accept, assign, revoke |
| 056 | `shared_table_inventory` | Shared table capacity + concurrency |

**Exit criteria:** Critical E2E checkout path; reservation E2E; concurrency tests; door check-in.

---

## Phase 3 — Platform surface (057–060)

| # | Migration | Purpose |
|---|-----------|---------|
| 057 | `i18n_translations` | TR/EN entity translations |
| 058 | `seo_metadata` | SEO fields, slugs, structured data support |
| 059 | `analytics_events` | Event-based analytics store |
| 060 | `communication_outbox` | Email/SMS/WhatsApp delivery jobs |

---

## Phase 4 — Intelligence & distribution (061–065)

| # | Migration | Purpose |
|---|-----------|---------|
| 061 | `discovery_foundation` | Sources, raw, candidates, evidence, claims |
| 062 | `social_publish_foundation` | Master content, channel variants, publish jobs |
| 063 | `ai_jobs_foundation` | AI job queue, validated outputs |
| 064 | `domain_outbox` | Business domain events |
| 065 | `amount_minor_additive` | Minor-unit columns + backfill |

---

## Frontend phases (parallel to DB)

| Phase | Deliverable |
|-------|-------------|
| F1 | Next.js scaffold, auth, org context, organizer dashboard |
| F2 | Event CRUD, commerce setup UI (045–047 RPCs) |
| F3 | Public event page, checkout, payment adapter stub |
| F4 | Ticket/reservation views, door QR app |
| F5 | Venue OS, SEO district pages |
| F6 | Discovery, social, analytics UI |

See [`plans/NEXTJS_SCAFFOLD_PLAN.md`](plans/NEXTJS_SCAFFOLD_PLAN.md).

---

## Rollback principle

Every migration must ship with a **corrective follow-up migration**, not edits to 001–047.  
048+ migrations use `BEGIN`/`COMMIT`; destructive rollback scripts are separate and never applied to production without approval.
