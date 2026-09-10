# B2.3 Implementation Report — iyzico Callback + Server-Side Verification

**Branch:** `cursor/sa-real-publish-v1`  
**Prior:** B1 `eb19557` · B2.1 `d10a116` · B2.2 `458b302`  
**Date:** 2026-09-10

## Summary

B2.3 wires Sandbox Checkout Form **callback → server-side CF retrieve/detail → VerifiedSettlement → confirm_payment_atomic**. Browser callback fields (`status`, `paymentId`, `paidPrice`, `conversationId`, etc.) are **never** trusted as payment results. Token is only an input to iyzico retrieve.

**B2.3 READY: YES** (mock + staging contract verified; live Sandbox charge opt-in not run in this session)

**Answer:** When a real Sandbox payment succeeds, the designed path verifies via `/payment/iyzipos/checkoutform/auth/ecom/detail`, builds `VerifiedSettlement`, calls existing `confirm_payment_atomic` (service_role), and reuses existing ticket activation + QR issuance. Success UI only shows after DB `orders.status === paid`.

---

## Callback route

- `src/app/api/payments/callback/iyzico/route.ts`
- **POST** primary (form or JSON `token`)
- **GET** does **not** settle — redirects failure (`CALLBACK_GET_NOT_SUPPORTED`)
- Redirects to `/tr/odeme/basarili|basarisiz` or `/en/checkout/success|failure`

## Retrieve / detail API

- Reuses B2.1 `IyzicoApiClient.retrieveCheckoutFormDetail`
- Path: `POST /payment/iyzipos/checkoutform/auth/ecom/detail`
- Auth: existing IYZWSv2 (not rewritten)

## Provider changes

- `IyzicoPaymentProvider.retrievePayment` maps CF detail → `RetrievePaymentResult`
- Uses `paidPrice` (fallback `price`); exposes both for dual checks
- `raw` omits secrets/signature

## PaymentService changes

- `handleProviderCallback({ token, locale? })`:
  1. Lookup `payment_sessions` by `(provider=iyzico, provider_token=token)`
  2. Load order from session `order_id` (not client orderId)
  3. Paid → idempotent noop
  4. `provider.retrievePayment`
  5. `buildVerifiedSettlementFromRetrieve`
  6. Session amount vs retrieve amount
  7. `settleVerifiedPayment` → `confirm_payment_atomic`
  8. Update session `succeeded` / `failed` / `expired`
- `settleVerifiedPayment`: amount/currency/order gates + **PAYMENT_AFTER_EXPIRY** when expired or `expires_at` passed

## Settlement flow

```
callback token
 → payment_sessions
 → retrievePayment(token)
 → buildVerifiedSettlementFromRetrieve
 → settleVerifiedPayment
 → confirm_payment_atomic
 → paid + tickets active + QR (existing RPC)
```

## Amount / currency / status / fraud

| Check | Behavior |
|--------|----------|
| Amount | Order ledger vs retrieve `paidPrice` (+ `price` must agree when both present) → `AMOUNT_MISMATCH` |
| Currency | Order vs retrieve; NULL order → `ORDER_CURRENCY_MISSING` |
| Order | `conversationId` must equal session conversation + orderId → `PAYMENT_ORDER_MISMATCH` |
| paymentStatus | Only `SUCCESS` settles |
| fraudStatus | Only `1`; `0`/unknown → `PAYMENT_FRAUD_REVIEW`; `-1` → `PAYMENT_FRAUD_REJECTED` |
| provider_payment_id | iyzico `paymentId`; unique `(provider, provider_payment_id)` |

## Duplicate / expiry

- Duplicate callback on paid order → success noop (no new tickets)
- `DUPLICATE_PROVIDER_PAYMENT` from RPC surfaced safely
- Expired / late success → **do not pay** → `PAYMENT_AFTER_EXPIRY`
- **No auto-refund in B2.3** — ops reconciliation/refund required (B3+)

## Payment session linkage

- Token must match `payment_sessions.provider_token` for iyzico
- Unknown token → `PAYMENT_SESSION_NOT_FOUND`
- Wrong-order token cannot settle another order

## Success / failure UX

- Routes: `/checkout/success` → TR `/odeme/basarili`; `/checkout/failure` → `/odeme/basarisiz`
- Success page re-checks DB: owner + `paid` before showing success (ignores browser `status`)
- Messages: `paymentResult` in `messages/tr.json` + `en.json`

## Security

- Staging Supabase host assert on payment paths
- Production iyzico base/callback rejected
- No `NEXT_PUBLIC_IYZICO_*`
- Secrets not logged; callback route does not echo secrets
- `confirm_payment_atomic` remains service_role-only (B1)
- No client `fromClient` / invent VerifiedSettlement API
- Webhook **not** implemented (B3)

## Tests

- `scripts/assert-b2.3-iyzico-callback.mjs` (A–T coverage)
- Wired into `npm test` + `npm run test:b2.3`
- Opt-in live: `IYZICO_B2_3_LIVE=1` (config assert only)

## Tests run

| Suite | Result |
|--------|--------|
| `npm run test:b2.3` | PASS |
| `npm test` | PASS (84 pass, 3 skipped) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Sprint1 e2e | FAIL (pre-existing: Publish button not found for seeded event — unrelated to B2.3) |
| Sprint2 e2e | PASS |
| Sprint3 e2e | FAIL (timeout / network during organizer publish setup — unrelated to B2.3 callback) |
| Live Sandbox `IYZICO_B2_3_LIVE=1` | Not run |

## Real Sandbox test?

**No** — not executed this session (mock + staging ACL sufficient). Credentials may exist in `.env.local`; live charge remains opt-in.

## Migration?

**No** — used existing `063_staging_payment_foundation.sql` (`payment_sessions`, payments unique, confirm gates). No schema gap found.

## Production accessed?

**No** — staging host `nksctgxmkymmiubkrohf` only; production Supabase/iyzico refused by helpers.

## B3 remaining (webhook)

- `POST /api/payments/webhooks/iyzico`
- `X-IYZ-SIGNATURE-V3` verification
- Webhook idempotency + `payment_webhook_events`
- Retrieve + settlement/reconciliation
- Late-payment refund / reconciliation ops for `PAYMENT_AFTER_EXPIRY`

## Git

No commit / push (per instructions).

---

## Files touched (B2.3)

- `src/app/api/payments/callback/iyzico/route.ts`
- `src/app/[locale]/checkout/success/page.tsx`
- `src/app/[locale]/checkout/failure/page.tsx`
- `src/lib/payments/service.ts`
- `src/lib/payments/settlement.ts`
- `src/lib/payments/providers/iyzico.ts`
- `src/lib/payments/types.ts`
- `src/lib/i18n/routing.ts`
- `messages/tr.json` / `messages/en.json`
- `.env.example`
- `scripts/assert-b2.3-iyzico-callback.mjs`
- `package.json`
- `B2_3_IMPLEMENTATION_REPORT.md`
