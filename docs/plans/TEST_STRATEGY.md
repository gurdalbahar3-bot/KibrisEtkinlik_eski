# Test Strategy

**Status:** PLAN — implement with each phase  
**Baseline:** Migrations 001–047 verified on remote

---

## 1. Test pyramid

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Pure functions, mappers, adapter parsers |
| Integration | Vitest + Supabase local/test project | RPC, RLS, backfill scripts |
| E2E | Playwright | Full user flows |
| Security | Custom + integration | Negative access, IDOR, replay |
| Concurrency | Integration (parallel workers) | Last seat/table races |

---

## 2. Infrastructure

### Database tests

- **Preferred:** Supabase local (`supabase start`) or dedicated test project
- Apply migrations 001–047, then test migration under review
- Each test run: transaction rollback or isolated schema where possible
- Never run destructive tests against production

### Frontend E2E

- Playwright against local Next.js + local Supabase
- Stub payment adapter for checkout path

---

## 3. Phase 0 / 047 verification (completed)

| Check | Result |
|-------|--------|
| File exists: `047_event_core_metadata_setup.sql` | ✅ |
| BEGIN/COMMIT wrapper | ✅ |
| 10 functions (2 internal + 8 public) | ✅ |
| REVOKE PUBLIC + GRANT authenticated on public RPCs | ✅ |
| No ALTER TABLE / no RLS changes | ✅ |
| Applied to remote DB (user verified) | ✅ |

---

## 4. Critical E2E flows (mandatory before commerce launch)

### Flow A — Ticket/seat checkout

```
Search (or direct link)
  → Event detail (published)
  → Select seat/table/ticket
  → create_mixed_cart_atomic
  → Payment (stub adapter)
  → confirm_payment_atomic
  → Ticket / entry_pass issued
  → use_qr_atomic → VALID
  → Second scan → ALREADY USED
```

### Flow B — Table reservation

```
Event
  → 4 guests
  → Table matching (guest_count)
  → Deposit line item
  → Confirm reservation
  → Check-in
```

---

## 5. Security negative tests (mandatory)

| # | Test | Expected |
|---|------|----------|
| 1 | Org A user reads Org B event by ID | Denied (RLS/RPC) |
| 2 | Customer A reads Customer B order | Denied |
| 3 | Staff without event permission calls manage RPC | Denied |
| 4 | Invalid QR scan | INVALID |
| 5 | Used QR scan again | ALREADY USED / rejected |
| 6 | Duplicate webhook same provider_event_id | No duplicate payment |
| 7 | Duplicate checkout same idempotency_key | No duplicate inventory |
| 8 | Browser env contains service role key | Must not exist |
| 9 | Direct INSERT on orders table as authenticated | Denied (RLS) |
| 10 | IDOR: random UUID to confirm_payment_atomic | Denied |

---

## 6. Concurrency tests

Parallel workers (≥2) attempt simultaneously:

- Last available seat
- Last available table
- Last shared-table capacity unit

**Assert:** Exactly one success; others get capacity error; no double allocation.

Implementation: Vitest concurrent test or k6 script calling RPC via Supabase client.

---

## 7. RLS test pattern

```typescript
describe('RLS tenant isolation', () => {
  it('org A cannot select org B events', async () => {
    const clientA = createClientAs(userA);
    const { data, error } = await clientA
      .from('events')
      .select('*')
      .eq('id', orgBEventId)
      .single();
    expect(data).toBeNull();
  });
});
```

Run for: events, venues, orders, organization_memberships (after 048).

---

## 8. RPC integration test pattern

```typescript
it('upsert_event_format_atomic requires can_manage_event', async () => {
  const { data } = await clientAsStranger.rpc('upsert_event_format_atomic', {
    p_event_id: eventId,
    p_format_type: 'general_admission',
  });
  expect(data.success).toBe(false);
  expect(data.error_code).toBe('UNAUTHORIZED'); // or actual code
});
```

Maintain catalog of error codes per RPC.

---

## 9. Migration test checklist (each 048+)

Before merge:

- [ ] Migration applies cleanly on fresh 001–047 base
- [ ] Post-apply verification queries pass
- [ ] Backfill counts documented
- [ ] RLS enabled on new tables
- [ ] REVOKE PUBLIC on new SECURITY DEFINER functions
- [ ] Regression: existing RPC smoke tests pass
- [ ] Rollback/corrective plan documented

### 048-specific

- [ ] Every event owner has organization_id after backfill
- [ ] owns_event still grants can_manage_event
- [ ] Org A ≠ Org B isolation

### 049-specific

- [ ] District seed count = 6
- [ ] İskele row exists with code `iskele`
- [ ] Original city/region text preserved
- [ ] Unmapped rows query documented

### 050-specific

- [ ] order_item_selections rows created on package checkout
- [ ] Historical orders unchanged

### 052-specific

- [ ] Duplicate webhook insert fails UNIQUE
- [ ] Second delivery returns success without double pay

---

## 10. Payment adapter tests

| Test | Type |
|------|------|
| Signature verification valid/invalid | Unit |
| Webhook parse mapping | Unit |
| Idempotent webhook processing | Integration |
| Stub checkout E2E | E2E |

---

## 11. CI pipeline (when frontend exists)

```yaml
# Proposed stages
- typecheck
- unit (vitest)
- supabase db reset + migrations + integration
- playwright (on PR to main)
```

Start with migration integration tests before CI complexity.

---

## 12. Test data

- Use `supabase/seed/` for roles, districts (after 049), test orgs (after 048)
- No production data in tests
- Factory helpers for: user, org, event, published event, order

---

## 13. Definition of done (per phase)

Phase not complete without:

- Unit tests for new pure logic
- Integration tests for new RPC/RLS
- Documented manual verification queries
- Critical E2E passing (when UI exists for that phase)
- Security negatives for new tenant boundaries
