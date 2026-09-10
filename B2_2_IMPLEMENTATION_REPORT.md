# B2.2 Implementation Report — iyzico Sandbox Checkout Session

**Date:** 2026-09-10  
**Branch:** `cursor/sa-real-publish-v1`  
**Checkpoints:** B1 `eb19557` · B2.1 `d10a116`  
**Commit/push:** not performed

---

## B2.2 READY: **YES**

Sandbox Checkout Form **initialize** is wired through `PaymentService.startPayment` → iyzico provider → Sandbox API client.  
Settlement / `confirm_payment_atomic` / callback / webhook / ticket activation are **not** done (B2.3+).

### Is initialize ready for a real Sandbox API call?

**YES**, when all of these are set in server env (never committed):

- `IYZICO_API_KEY`
- `IYZICO_SECRET_KEY`
- `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com`
- `IYZICO_CALLBACK_URL=https://<staging-host>/api/payments/iyzico/callback` (URL only; route not implemented yet)
- Customer profile has `email`, `full_name`, `phone`
- `SUPABASE_URL` points at staging `nksctgxmkymmiubkrohf`

If iyzico env is **not** configured, checkout creates a `pending_payment` order and redirects to the order page (Sprint3-safe degrade).

### Customer path for first real Sandbox payment test

1. Customer logs in (with name + phone on profile)  
2. Opens `/{locale}/odeme?event=…`  
3. Clicks **Ödemeye geç** / Continue to payment  
4. `checkout_ticket_only_atomic` creates/resumes `pending_payment` order  
5. `PaymentService.startPayment` loads ledger amount/currency/items + profile  
6. iyzico CF Initialize (Sandbox) returns `token` + `paymentPageUrl`  
7. Row written to `payment_sessions` (`status=redirected`)  
8. Browser redirects to iyzico Sandbox payment page  
9. After pay attempt, iyzico POSTs to callback URL — **handler not built yet** (B2.3); order stays `pending_payment`, tickets stay inactive  

Alternate: order detail **Ödemeye geç** CTA → `startOrderPaymentAction` → same startPayment path.

---

## Changed / new files

| File | Role |
|---|---|
| `src/lib/payments/service.ts` | Real `startPayment` (ledger + profile + CF init; no settlement) |
| `src/lib/payments/mapping.ts` | Money/basket/name helpers + public DTO |
| `src/lib/payments/types.ts` | Rich `CreatePaymentSessionInput` (buyer/basket) |
| `src/lib/payments/providers/iyzico.ts` | `createPaymentSession` → real CF initialize (stubMode for tests) |
| `src/lib/payments/providers/iyzico-config.ts` | `resolveIyzicoCallbackUrl`, `isIyzicoCheckoutConfigured` |
| `src/lib/payments/factory.ts` | `stub` uses `stubMode: true` |
| `src/lib/customer/checkout-actions.ts` | After order create → startPayment; + `startOrderPaymentAction` |
| `src/components/customer/CheckoutForm.tsx` | Payment error codes |
| `src/components/customer/OrderPayButton.tsx` | Order-detail pay CTA |
| `src/app/[locale]/account/orders/[id]/page.tsx` | Pay button + error display |
| `messages/tr.json` / `en.json` | Copy for pay CTA / errors |
| `.env.example` | Callback + sandbox buyer placeholders |
| `scripts/assert-b2.2-iyzico-checkout.mjs` | Mock tests |
| `package.json` | `test` / `test:b2.2` |

**Not changed:** 058/059/060/063, no new migration, no callback route, no webhook.

---

## PaymentService flow

1. Staging host assert  
2. Load order — ownership, `pending_payment`, not expired, currency `TRY`, total > 0  
3. Load `order_items` → basket; sum must match ledger  
4. Load `profiles` — require email, full_name, phone  
5. Sandbox-only defaults for identity/address (no profile columns; no migration)  
6. `IYZICO_CALLBACK_URL` from env  
7. Cancel prior in-flight `payment_sessions` for order  
8. Provider `createPaymentSession` → CF initialize  
9. Insert session (`provider_token`, `redirected`)  
10. Return public DTO only (`provider`, `orderId`, `token`, `checkoutFormContent`, `paymentPageUrl`, `sessionId`)

**Order total source:** `orders.total_amount`  
**Currency source:** `orders.currency` (must be TRY)  
**Customer source:** `profiles` (+ sandbox identity/address defaults)  
**Client price:** accepted in FormData but ignored  

---

## Idempotency

Schema has no `payment_page_url` column, so a prior session cannot be resumed for redirect without re-initialize.  
Approach: cancel active (`created`/`redirected`/`awaiting_provider`) sessions, then create one new session (unique active index preserved).  
True resume would need a future additive column (not done in B2.2).

---

## Security

- No `NEXT_PUBLIC_IYZICO_*`  
- Secrets never in DTO / user errors  
- Production `api.iyzipay.com` rejected  
- Production Supabase not touched  
- No `confirm_payment_atomic` in checkout path  
- Amount/currency from DB only  

---

## Tests

| Suite | Result |
|---|---|
| `npm run test:b2.2` | PASS (6 pass, 1 skip live) |
| `npm test` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Sprint1 / 2 / 3 | PASS (after Playwright Chromium reinstall) |

**Real Sandbox API call during implementation:** **NO** (mocks only).  
**Migration created:** **NO**  
**Production accessed:** **NO**

---

## Remaining for B2.3

- Implement callback route (POST `token`)  
- Retrieve CF detail + signature verify  
- Amount/currency/fraud gates → `settleVerifiedPayment` / `confirm_payment_atomic`  
- Do **not** treat callback alone as success  
- Optional embed of `checkoutFormContent`  
- Consider profile fields for identity/address (or keep sandbox defaults)  
- Webhook still B3  

---

*End of B2.2 report.*
