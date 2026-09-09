# B2.1 Implementation Report — iyzico Sandbox Client / Auth Foundation

**Date:** 2026-09-09  
**Branch:** `cursor/sa-real-publish-v1`  
**Checkpoint:** B1 `eb19557` (parent `f6300b6`)  
**Commit/push:** not performed (as requested)

---

## Summary

B2.1 adds a server-side IYZWSv2 auth layer and Checkout Form HTTP client against **sandbox only**.  
`PaymentProvider.createPaymentSession` remains a **stub** so checkout cannot start a real charge yet.  
No callback route, no checkout UI wire, no webhook, no migration, no production touch.

### B2.1 READY: **YES**

---

## Changed files

| File | Change |
|---|---|
| `.env.example` | Sandbox env contract clarified; optional `IYZICO_TIMEOUT_MS`, `IYZICO_CALLBACK_URL` placeholders; forbid `NEXT_PUBLIC_IYZICO_*` |
| `package.json` | Wire `assert-b2.1-iyzico-auth.mjs` into `npm test`; add `test:b2.1` |
| `src/lib/payments/types.ts` | Optional `checkoutFormContent`; `paymentStatus` on retrieve result; note that trusted settlement has no client constructor |
| `src/lib/payments/factory.ts` | Explicit `iyzico` vs `stub`; production base URL refuse uses env arg |
| `src/lib/payments/providers/iyzico.ts` | Server-only provider wrapper; stub `createPaymentSession`; exposes CF initialize/retrieve via API client |

## New files

| File | Role |
|---|---|
| `src/lib/payments/providers/iyzico-auth.ts` | Pure IYZWSv2 HMAC helpers + redaction + CF retrieve signature payload helper |
| `src/lib/payments/providers/iyzico-types.ts` | Provider DTOs + `IyzicoProviderError` (not domain settlement) |
| `src/lib/payments/providers/iyzico-config.ts` | Env load + sandbox URL allow / production forbid |
| `src/lib/payments/providers/iyzico-client.ts` | Authenticated `fetch` client: `initializeCheckoutForm`, `retrieveCheckoutFormDetail` |
| `scripts/assert-b2.1-iyzico-auth.mjs` | Unit tests A–J + opt-in live skip |
| `B2_1_IMPLEMENTATION_REPORT.md` | This report |

---

## Auth implementation

- Algorithm per iyzico docs: `HMAC-SHA256(randomKey + uriPath + requestBodyJson, secretKey)` → hex  
- Header: `Authorization: IYZWSv2 <base64(apiKey:…&randomKey:…&signature:…)>`  
- Same `randomKey` sent as `x-iyzi-rnd`  
- **Exact** `JSON.stringify` body reused for wire + signature (single serialization)  
- Secrets passed as args / config; `redactIyzicoSecrets` for error messages  
- Pure module (no env reads) for deterministic unit tests  

---

## HTTP client

- Base URL from config (must be `https` + sandbox `*iyzipay.com`)  
- Paths:  
  - `POST /payment/iyzipos/checkoutform/initialize/auth/ecom`  
  - `POST /payment/iyzipos/checkoutform/auth/ecom/detail`  
- Timeout via `AbortSignal.timeout` (default 15s, override `IYZICO_TIMEOUT_MS`)  
- Non-2xx / non-JSON / missing token → `IyzicoProviderError`  
- Injected `fetch` for tests  

**Real iyzico Sandbox API call during this phase:** **NO** (unit tests use mock `fetch`; live opt-in test skipped without `IYZICO_B2_1_LIVE=1`)

---

## Env contract

```
IYZICO_API_KEY=
IYZICO_SECRET_KEY=
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
# optional:
IYZICO_TIMEOUT_MS=15000
IYZICO_CALLBACK_URL=   # B2.3+
```

- No `NEXT_PUBLIC_IYZICO_*`  
- Production `api.iyzipay.com` rejected  
- `.env.local` not modified/committed by this work  

---

## Provider abstraction

- `PaymentProvider` interface unchanged  
- Domain types remain separate from iyzico DTOs  
- `createPaymentSession` → stub (`b2_1_no_checkout_wire`) so `PaymentService.startPayment` cannot charge  
- Real CF methods: `initializeCheckoutForm` / `retrieveCheckoutFormDetail` / `retrievePayment` (mapping ready for B2.2, not wired to settlement callback)  
- `verifyWebhook` → `WEBHOOK_NOT_IMPLEMENTED_B3`  

---

## Security checks

| Check | Status |
|---|---|
| API key / secret server-side only | YES |
| No `NEXT_PUBLIC` secrets | YES |
| No secret logging in errors/tests | YES |
| Production iyzico URL rejected | YES |
| No client trusted amount settlement helper | YES |
| No client `confirm_payment_atomic` | unchanged |
| Service-role boundary | unchanged |
| Production Supabase | untouched |
| 058/059/060/063 | untouched; no new migration |

---

## Test results

| Suite | Result |
|---|---|
| `npm run test:b2.1` | PASS (10 pass, 1 skip live) |
| `npm test` | PASS (61 pass, 1 skip) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Sprint1 | PASS (after `npx playwright install chromium`) |
| Sprint2 | PASS |
| Sprint3 | PASS |

Note: first Sprint runs failed only because Playwright Chromium was missing in the environment cache; unrelated to B2.1 code. Re-install + re-run → all green.

---

## Remaining for B2.2+

- **B2.2:** Implement `PaymentService.handleProviderCallback` — session lookup → CF retrieve → signature verify → amount/currency/fraud gates → `settleVerifiedPayment`  
- **B2.3:** Checkout/order UI + Server Action call real `initializeCheckoutForm`; callback route; absolute `IYZICO_CALLBACK_URL`  
- **B2.4:** Gated live Sandbox smoke with test cards  
- Buyer/basket assembly from profile/order  
- Still no webhook (B3), no QR UI work beyond existing tickets  

---

## Decision

**B2.1 READY: YES**
