# B3–B6 Payment Sprint Report

**Branch:** `cursor/sa-real-publish-v1`  
**Base:** B2.3 `564f391`

## Completed

| Phase | Commit | Status |
|-------|--------|--------|
| B3 webhook | `42f7abd` feat: add iyzico webhook processing | DONE |
| B4 reconciliation | `fc6a42b` feat: harden payment reconciliation | DONE |
| B5 checkout harden | `301455b` feat: harden customer checkout payments | DONE |
| B6 e2e tests | (this commit) test: complete payment e2e hardening | DONE |

## What changed

### B3
- `POST /api/payments/webhook/iyzico` — raw body + `X-IYZ-SIGNATURE-V3`
- Signature helpers in `iyzico-auth.ts` (HPP + direct)
- `IyzicoPaymentProvider.verifyWebhook`
- `PaymentService.handleProviderWebhook` → `payment_webhook_events` idempotency → reuse callback settle
- Tests: `assert-b3-iyzico-webhook.mjs`

### B4
- `reconciliation.ts` — classify late/duplicate/stale sessions; **no auto-refund**
- `PaymentService.reconcileOrderPayments` + called from `startPayment`
- Tests: `assert-b4-payment-reconciliation.mjs`

### B5
- `checkout-safety.ts` — DB-only amount/currency gates; paid+ticket+QR integrity
- `startOrderPaymentAction` re-validates ownership/payable; ignores client price/currency
- Success page requires paid + active tickets + QR
- Tests: `assert-b5-checkout-hardening.mjs`

### B6
- Chain/webhook/state/expiry/duplicate/production-safety tests
- `assert-b6-payment-e2e.mjs`

## Migration

**No new migration.** Used existing `063` (`payment_webhook_events`, sessions, confirm gates).  
058/059/060 **not modified**.

## Production

- Staging Supabase only (`nksctgxmkymmiubkrohf`)
- Production iyzico URL rejected
- No production DB apply
- No push
- No live Sandbox charge in CI (`IYZICO_B6_LIVE` opt-in only)

## Remaining gaps

1. Live Sandbox end-to-end charge → webhook delivery not executed in this sprint
2. Auto-refund for `PAYMENT_AFTER_EXPIRY` still manual ops
3. CF retrieve response signature verification still optional (helpers exist)
4. Sprint1/Sprint3 Playwright flakiness unrelated to payment core
5. Webhook merchant-panel URL must be configured in iyzico Sandbox for real deliveries
