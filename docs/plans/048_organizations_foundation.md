# 048 — Organizations Foundation — Detailed Plan

**Status:** DESIGN ONLY — do not execute until approved  
**Depends on:** 001–047 applied  
**Blocks:** 049 (org-scoped location), 051 (RBAC scopes)

---

## 1. Purpose

Introduce `organizations` and `organization_memberships` as the future tenant boundary while preserving existing owner-based access during staged migration.

---

## 2. New tables

### `organizations`

```sql
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug)
);
```

### `organization_memberships`

```sql
CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  profile_id uuid NOT NULL REFERENCES public.profiles (id),
  role_id uuid NOT NULL REFERENCES public.roles (id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'invited')),
  invited_by uuid NULL REFERENCES public.profiles (id),
  joined_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_org_profile_unique
    UNIQUE (organization_id, profile_id)
);
```

### Optional: `organization_venues` (junction)

Links venues explicitly to organizations when venue owner differs from event organizer org. Defer if 048 can use direct FK on venues first.

---

## 3. Additive column changes (nullable first)

| Table | Column | Notes |
|-------|--------|-------|
| `events` | `organization_id uuid NULL REFERENCES organizations(id)` | Staged |
| `venues` | `organization_id uuid NULL REFERENCES organizations(id)` | Staged |
| `organizer_profiles` | `organization_id uuid NULL REFERENCES organizations(id)` | Compatibility link |

**Do not** add NOT NULL in 048.

---

## 4. Backfill strategy

### Step 1 — Create organizations (deterministic)

For each distinct `events.owner_id` that has an `organizer_profiles` row:

```
organization.slug  = 'org-' || left(owner_id::text, 8)  -- or slug from organization_name
organization.name  = COALESCE(organizer_profiles.organization_name, profiles.display_name, 'Organization')
```

For venue owners without organizer profile:

```
organization from venue_owner_profiles.business_name or profile
```

### Step 2 — Create membership

```
organization_memberships:
  profile_id = owner_id
  role_id = role where code = 'owner' (or 'admin' if no owner role — verify seed)
  status = 'active'
  joined_at = now()
```

### Step 3 — Backfill FKs

```sql
UPDATE events e
SET organization_id = om.organization_id
FROM organization_memberships om
WHERE om.profile_id = e.owner_id
  AND om.status = 'active'
  AND e.organization_id IS NULL;
```

Same pattern for `venues.owner_id` → `venues.organization_id`.

### Step 4 — Link organizer_profiles

```sql
UPDATE organizer_profiles op
SET organization_id = om.organization_id
FROM organization_memberships om
WHERE om.profile_id = op.profile_id
  AND om.status = 'active';
```

### Step 5 — Validation queries (must pass before 048b)

- Count events with NULL `organization_id` where owner has membership → **0**
- Count venues with NULL `organization_id` where owner has membership → **0**
- No orphan memberships
- Duplicate slug check

---

## 5. New auth helpers (additive)

```sql
-- Returns true if auth.uid() is active member of org
can_access_organization(p_organization_id uuid) → boolean

-- Returns true if member has role permission in org scope
has_org_permission(p_organization_id uuid, p_permission_code text) → boolean

-- Extend (do not replace):
can_manage_event(p_event_id) :=
  owns_event(p_event_id)
  OR is_super_admin()
  OR has_event_staff_role(...)
  OR EXISTS (org membership on event.organization_id with manage permission)
```

**Critical:** Existing `owns_event` path must remain functional throughout.

---

## 6. RLS strategy

### Phase A (048) — additive policies

1. Enable RLS on `organizations`, `organization_memberships`
2. SELECT: member sees own orgs; super_admin sees all
3. INSERT/UPDATE/DELETE: via SECURITY DEFINER RPC only (match 045–047 pattern)

### Phase B (048 or 049+) — extend event/venue policies

Add OR clause:

```sql
can_access_organization(events.organization_id)
AND has_org_permission(events.organization_id, 'event.read')
```

Do **not** remove `owns_event` OR branch until validated.

### Cross-tenant negative tests (mandatory)

- User in Org A cannot SELECT Org B events via direct ID
- User in Org A cannot call manage RPC on Org B event

---

## 7. Public RPCs (048)

| RPC | Purpose |
|-----|---------|
| `create_organization_atomic` | Create org + owner membership |
| `update_organization_atomic` | Name, slug (admin) |
| `invite_organization_member_atomic` | Invite by email |
| `accept_organization_invite_atomic` | Accept invite token |
| `update_organization_member_role_atomic` | Change role |
| `deactivate_organization_member_atomic` | Remove access |

All: `auth.uid()` + permission check + REVOKE PUBLIC + GRANT authenticated.

---

## 8. organizer_profiles compatibility

- **Do not delete** `organizer_profiles` or `organization_name`
- Add `organization_id` FK as canonical link
- `organization_name` becomes denormalized display fallback until UI migrates
- Deprecation note in docs; removal not before Phase 3+

---

## 9. staff_assignments interaction

`staff_assignments.organizer_id` references `organizer_profiles.profile_id` today.  
048 does not rewrite staff tables. Future migration may add `organization_id` to staff_assignments for org-scoped staff (055).

---

## 10. Rollback / correction strategy

| Scenario | Action |
|----------|--------|
| Bad backfill | Corrective 048b migration: fix FK assignments from audit table |
| Wrong org merge | Manual super_admin RPC to reassign organization_id |
| Need to undo 048 | **Do not drop tables with data.** Set organization_id NULL via corrective migration only if no downstream deps |

048 migration file must include post-apply verification queries in comments.

---

## 11. Risk assessment

| Risk | Mitigation |
|------|------------|
| Owner without organizer_profile | Fallback org from profile email/display_name |
| Multiple owners same org name | Unique slug with UUID suffix |
| Event owner ≠ venue owner org | Nullable FK; junction table in later migration if needed |
| RLS regression | Parallel owns_event + org paths; negative test suite |

---

## 12. Test requirements (048)

- Unit: backfill deterministic mapping
- Integration: create org, invite, accept, manage event
- RLS: Org A ≠ Org B isolation
- Regression: existing `can_manage_event` for owner_id still works when organization_id NULL during partial rollout

---

## 13. Estimated scope

- ~400–600 lines SQL
- 6 public RPCs + 2–3 helpers
- No changes to 001–047 files
