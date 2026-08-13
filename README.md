# Kıbrıs Etkinlik & Rezervasyon Platformu

## Project

Kıbrıs Etkinlik & Rezervasyon Platformu

## Architecture

FAZ 0 v1.3 — RECONCILED FINAL LOCKED SPEC

Teknik referans: [`docs/FAZ_0_v1.3_FINAL_LOCKED_SPEC.md`](docs/FAZ_0_v1.3_FINAL_LOCKED_SPEC.md)

## Database target

- **66 tables**
- **34 migrations** (001–034)
- **17 atomic RPC** (migration 034)
- RLS, SECURITY DEFINER, FOR UPDATE concurrency locking
- Strict state machines, three capacity models, financial invariants

## Current phase

Pre-coding / project skeleton

## IMPORTANT

- Migration henüz uygulanmadı.
- Supabase remote henüz bağlanmadı.
- Payment provider henüz seçilmedi.
- Web framework henüz seçilmedi.

## Structure

```
KibrisEtkinlik/
├── docs/
│   ├── ANA_PROJE_DOKUMANI_v1.1.docx
│   └── FAZ_0_v1.3_FINAL_LOCKED_SPEC.md
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── seed/
├── src/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Environment

Copy `.env.example` to `.env` when Supabase is configured (not yet).

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
