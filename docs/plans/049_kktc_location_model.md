# 049 — KKTC Location Model — Detailed Plan

**Status:** DESIGN ONLY — do not execute until 048 approved/applied  
**Depends on:** 048 (optional org-scoped location admin)  
**Critical:** İskele must be included in seed data

---

## 1. Purpose

Replace free-text district reliance with canonical KKTC district entities while preserving original location text for audit and manual review.

---

## 2. New tables

### `kktc_districts`

```sql
CREATE TABLE public.kktc_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,           -- stable: 'lefkosa', 'gazimagusa', 'girne', 'guzelyurt', 'lefke', 'iskele'
  name_tr text NOT NULL,
  name_en text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kktc_districts_code_unique UNIQUE (code)
);
```

### `kktc_neighborhoods` (optional in 049, recommended)

```sql
CREATE TABLE public.kktc_neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES public.kktc_districts (id),
  name_tr text NOT NULL,
  name_en text NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kktc_neighborhoods_district_slug_unique UNIQUE (district_id, slug)
);
```

Neighborhoods can ship empty; districts must be fully seeded in 049.

---

## 3. Seed data (mandatory — all 6 districts)

| code | name_tr | name_en | sort_order |
|------|---------|---------|------------|
| `lefkosa` | Lefkoşa | Nicosia | 1 |
| `gazimagusa` | Gazimağusa | Famagusta | 2 |
| `girne` | Girne | Kyrenia | 3 |
| `guzelyurt` | Güzelyurt | Morphou | 4 |
| `lefke` | Lefke | Lefka | 5 |
| `iskele` | İskele | Trikomo | 6 |

**Verification query after seed:** `SELECT count(*) FROM kktc_districts WHERE is_active` → **6**

---

## 4. Additive FK columns (nullable)

| Table | New columns | Preserve original |
|-------|-------------|-------------------|
| `venues` | `district_id uuid NULL`, `neighborhood_id uuid NULL` | Keep `city`, `region` |
| `event_locations` | `district_id uuid NULL`, `neighborhood_id uuid NULL` | Keep `city`, `region` |
| `events` | `district_id uuid NULL` (optional denorm for search) | — |

**Do not drop** `city` / `region` text columns.

---

## 5. Mapping / backfill strategy

### Automated mapping (first pass)

Case-insensitive normalize Turkish characters where possible:

| Text pattern | district code |
|--------------|---------------|
| lefkoşa, lefkosa, nicosia | lefkosa |
| gazimağusa, magosa, famagusta | gazimagusa |
| girne, kyrenia | girne |
| güzelyurt, guzelyurt, morphou | guzelyurt |
| lefke, lefka | lefke |
| iskele, İskele, trikomo, yeni iskele | **iskele** |

```sql
UPDATE venues v
SET district_id = d.id
FROM kktc_districts d
WHERE v.district_id IS NULL
  AND lower(unaccent(coalesce(v.city, v.region, ''))) ~ d.code_pattern;
```

Use explicit CASE mapping in migration, not fragile regex-only for production.

### Review queue (unmapped rows)

Create view or flag:

```sql
-- venues_location_unmapped
SELECT id, city, region FROM venues WHERE district_id IS NULL AND (city IS NOT NULL OR region IS NOT NULL);
```

Unmapped rows remain valid; admin UI resolves later.

### event_locations

Map from `event_locations.city/region` using same rules.  
If event has venue with district_id, optionally copy:

```sql
UPDATE event_locations el
SET district_id = v.district_id
FROM events e
JOIN venues v ON v.id = e.venue_id
WHERE el.event_id = e.id AND el.district_id IS NULL AND v.district_id IS NOT NULL;
```

---

## 6. Validation constraints (staged)

**049:** FK + CHECK only where district_id IS NOT NULL.

**Future (049b or 058):** NOT NULL on new venues/events after cutover date — not in initial 049.

Coordinate validation unchanged (047 effective coordinate logic).

---

## 7. RLS strategy

| Table | Policy |
|-------|--------|
| `kktc_districts` | SELECT public (read-only canonical) |
| `kktc_neighborhoods` | SELECT public |
| Mutations | super_admin or service role only |

District data is reference data, not tenant-private.

Venue/event district FK updates go through existing manage RPCs (extended in 049 or app layer).

---

## 8. RPC changes (049)

| RPC | Change |
|-----|--------|
| `upsert_event_location_atomic` | Accept optional `p_district_id`, `p_neighborhood_id`; validate FK exists |
| Venue layout RPCs (043) | Accept optional `p_district_id` on venue update — or separate `update_venue_location_atomic` |

Prefer **extend** 047 location RPC rather than duplicate.

---

## 9. SEO preparation (feeds 058)

District codes enable routes:

- `/tr/ilce/iskele-etkinlikleri`
- `/en/district/iskele-events`

049 only adds data model; 058 adds SEO metadata columns.

---

## 10. Rollback / correction strategy

| Scenario | Action |
|----------|--------|
| Wrong district mapping | Corrective UPDATE on district_id; original city/region preserved |
| Missing İskele in seed | **Block migration** — seed verification fails |
| Need to rename district display | UPDATE name_tr/name_en only; code immutable |

---

## 11. Data migration risks

| Risk | Mitigation |
|------|------------|
| İskele omitted | Explicit seed + count=6 test |
| Ambiguous city text | Leave NULL; review queue |
| Turkish character mismatch | Normalize with unaccent or explicit CASE |
| Event/venue district mismatch | Log warning; do not force |

---

## 12. Test requirements

- Seed count = 6 including iskele
- Mapping: "İskele", "iskele", "ISKELE" → iskele district_id
- Unmapped venues still readable
- Location RPC accepts district_id
- Public SELECT on districts without auth

---

## 13. Estimated scope

- ~250–400 lines SQL
- Seed + backfill + 1–2 RPC extensions
- No ALTER of existing CHECK constraints on city/region
