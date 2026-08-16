# Master Architecture V1 — Governance Record

**Status:** APPROVED (baseline)  
**Date:** August 2026

This document records the approved architectural decisions. It does not replace migration files or the live schema.

---

## Immutable production history

- Migrations **001–047** must not be edited, renamed, deleted, reordered, or squashed.
- New schema changes: **048+** additive/corrective migrations only.
- Do not reset Supabase or drop production tables.

---

## Approved decisions

| # | Decision | Rule |
|---|----------|------|
| 1 | Baseline | Audit report accepted; evolve incrementally |
| 2 | Organizations | 048 — staged nullable FK, backfill, then constraints |
| 3 | organizer_profiles | Keep; org is tenant, profile is identity representation |
| 4 | Venue spaces | Reuse `venue_areas`; no parallel spaces system |
| 5 | KKTC location | 049 — 6 canonical districts including **İskele** |
| 6 | Currency | TRY/TL primary; additive `amount_minor` in 065 |
| 7 | Payment | Provider adapter abstraction; no hard-coded provider |
| 8 | Idempotency | High priority; 052 before live payment integration |
| 9 | Package checkout | 050 connects 046 catalog to `order_item_selections` |
| 10 | Legacy RPCs | Deprecate gradually; new code uses `_atomic` |
| 11 | RBAC | Activate `role_permissions` progressively (051) |
| 12 | RLS | Mandatory; organization-aware policies in staged rollout |
| 13 | Event/reservation states | Inspect before enum changes; compatibility mapping |
| 14 | Shared table | 056; reuse `venue_tables`, locks, reservations |
| 15 | Free VIP | Reuse ticket/entry_pass; price=0 still consumes inventory |
| 16 | Central inventory | Single authoritative engine for all channels |
| 17 | Discovery | Separate domain; claim/verify before platform event |
| 18 | AI | Intelligence layer only; not authoritative for money/inventory |
| 19 | Frontend | Next.js + Supabase; no service role in browser |
| 20 | i18n | TR + EN; no hard-coded Turkish in business logic |
| 21 | Outbox | Domain outbox vs communication outbox — separate responsibilities |
| 22 | Search | Query abstraction first; external engine only if scale requires |

---

## Frontend build order (approved)

1. Next.js scaffold  
2. Authentication  
3. Organization context  
4. Organizer dashboard  
5. Event list  
6. Event CRUD via RPC  
7. Commerce setup  
8. Public event page  
9. Checkout  
10. Payment adapter  
11. Ticket/reservation  
12. QR check-in  
13. Venue OS  
14. SEO  
15. Discovery UI  
16. Social UI  
17. Advanced analytics  

---

## Migration order (048–065)

See [`MIGRATION_ROADMAP.md`](MIGRATION_ROADMAP.md).

Dependency changes require explicit proposal before execution.

---

## When to stop for approval

Only for decisions that materially affect:
- Database architecture
- Production data
- Migration strategy
- Payment/legal compliance
- Security model
- Destructive changes
- Major vendor lock-in

Ordinary implementation details: choose safest path consistent with this document.
