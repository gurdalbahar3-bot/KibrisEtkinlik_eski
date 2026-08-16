# Kıbrıs Etkinlik & Rezervasyon Platformu

KKTC odaklı etkinlik keşfi, etkinlik ticareti ve operasyon platformu.

## Current state (August 2026)

| Item | Status |
|------|--------|
| **Migrations** | 47 files (001–047), **immutable production history** |
| **Remote database** | Migrations 001–047 applied and verified |
| **Architecture baseline** | Master Architecture V1 — audit approved |
| **Implementation phase** | Phase 0 complete → Phase 1 (048+) pending approval per migration |
| **Frontend** | Not yet scaffolded (Next.js + Supabase planned) |
| **Payment provider** | Not selected; adapter abstraction planned |

## Architecture

**Database-first / RPC-centric.** Business rules live primarily in PostgreSQL SECURITY DEFINER functions with deny-by-default RLS.

| Document | Purpose |
|----------|---------|
| [`docs/CURRENT_STATE_ARCHITECTURE.md`](docs/CURRENT_STATE_ARCHITECTURE.md) | Live schema, domains, RPC inventory |
| [`docs/MASTER_ARCHITECTURE_V1_GOVERNANCE.md`](docs/MASTER_ARCHITECTURE_V1_GOVERNANCE.md) | Approved Master Architecture V1 decisions |
| [`docs/MIGRATION_ROADMAP.md`](docs/MIGRATION_ROADMAP.md) | 048+ migration order and phases |
| [`docs/FAZ_0_v1.3_FINAL_LOCKED_SPEC.md`](docs/FAZ_0_v1.3_FINAL_LOCKED_SPEC.md) | Historical reference (034-era spec) |

## Database

- **~70 tables** across identity, venue, event, commerce, orders, payments, QR/check-in, staff, notifications, social, audit
- **100+ public RPCs** (034 core checkout + 040–047 commerce/admission/metadata)
- RLS deny-by-default; mutations via SECURITY DEFINER RPCs
- Concurrency via `FOR UPDATE` locking and `resource_locks`

### Recent migrations (045–047)

| # | Name | Scope |
|---|------|-------|
| 045 | Event Commerce Setup | Ticket zones, packages, blocks, seat pricing batch |
| 046 | Package Catalog | Package items, options, upgrades, sale categories |
| 047 | Event Core Metadata | Formats, locations, contacts, wedding details RPCs |

## Project structure

```
KibrisEtkinlik/
├── docs/
│   ├── CURRENT_STATE_ARCHITECTURE.md
│   ├── MASTER_ARCHITECTURE_V1_GOVERNANCE.md
│   ├── MIGRATION_ROADMAP.md
│   ├── RPC_DEPRECATION.md
│   ├── FAZ_0_v1.3_FINAL_LOCKED_SPEC.md   (historical)
│   └── plans/
│       ├── 048_organizations_foundation.md
│       ├── 049_kktc_location_model.md
│       ├── NEXTJS_SCAFFOLD_PLAN.md
│       ├── PAYMENT_ADAPTER_DESIGN.md
│       └── TEST_STRATEGY.md
├── supabase/
│   ├── config.toml
│   ├── migrations/    (001–047, immutable)
│   └── seed/
├── src/               (frontend — not yet scaffolded)
├── .env.example
├── package.json
└── README.md
```

## Environment

Copy `.env.example` to `.env` and fill Supabase credentials:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.**

## Development rules

1. **Do not modify migrations 001–047.** New schema changes start at 048+.
2. **Do not reset production.** Use additive/corrective migrations.
3. **Do not create parallel domain systems.** Reuse existing tables and RPCs.
4. **Evolve incrementally.** Master Architecture V1 is the target, not a big-bang rewrite.
5. Prefer `_atomic` RPC variants over legacy non-atomic RPCs in new code.

## Next steps

See [`docs/MIGRATION_ROADMAP.md`](docs/MIGRATION_ROADMAP.md) for the approved 048+ order. Phase 1 begins with migration 048 (organizations foundation) after plan review.
