# Payment Provider Adapter Design

**Status:** DESIGN ONLY — no provider selected  
**Priority:** Schema idempotency (052) before live integration  
**Rule:** Payment domain must not hard-code iyzico, Stripe, or any specific provider

---

## 1. Architecture

```
┌─────────────────────────────────────────┐
│  Next.js checkout / webhook routes      │
├─────────────────────────────────────────┤
│  PaymentService (domain)                │
│  - createPaymentAttempt                 │
│  - confirmFromWebhook                   │
│  - requestRefund                        │
├─────────────────────────────────────────┤
│  PaymentProviderAdapter (interface)     │
├──────────┬──────────┬───────────────────┤
│ Iyzico   │ Stripe   │ FutureProvider    │
│ Adapter  │ Adapter  │ Adapter           │
└──────────┴──────────┴───────────────────┘
         ↓
┌─────────────────────────────────────────┐
│  Supabase RPC                           │
│  confirm_payment_atomic                 │
│  fail_payment_atomic                    │
│  (+ 052 webhook idempotency tables)     │
└─────────────────────────────────────────┘
```

**Source of truth:** Payment provider response + internal `payments.status` — never frontend success message alone.

---

## 2. Provider interface (TypeScript)

```typescript
export interface PaymentProviderAdapter {
  readonly providerCode: string; // 'iyzico' | 'stripe' | ...

  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult>;

  verifyWebhookSignature(
    headers: Headers,
    rawBody: string
  ): WebhookVerificationResult;

  parseWebhookEvent(rawBody: string): ProviderWebhookEvent;

  capturePayment?(providerPaymentId: string): Promise<CaptureResult>;

  refundPayment(input: RefundInput): Promise<RefundResult>;
}
```

Factory:

```typescript
export function getPaymentAdapter(providerCode: string): PaymentProviderAdapter {
  switch (providerCode) {
    case 'stub': return stubAdapter; // dev/test
    // case 'iyzico': return iyzicoAdapter;
    default: throw new UnknownProviderError(providerCode);
  }
}
```

---

## 3. Domain types (provider-independent)

```typescript
interface CreateCheckoutInput {
  orderId: string;
  amountMinor: number;      // prefer after 065; until then convert from numeric
  currency: 'TRY';          // primary; extensible
  idempotencyKey: string;
  customerEmail?: string;
  returnUrl: string;
  cancelUrl: string;
}

interface ProviderWebhookEvent {
  providerEventId: string;
  providerPaymentId: string;
  idempotencyKey?: string;
  status: 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  amountMinor: number;
  currency: string;
  rawPayload: unknown;
}
```

---

## 4. Webhook flow (mandatory)

```
Receive POST /api/v1/webhooks/payment
  ↓
Verify signature (adapter)
  ↓
Parse + schema validate
  ↓
Check idempotency (provider_event_id UNIQUE — 052)
  ↓
If duplicate → 200 OK, no side effects
  ↓
Map to internal status
  ↓
Call confirm_payment_atomic / fail_payment_atomic (service role)
  ↓
Persist webhook audit row
  ↓
200 OK
```

---

## 5. Schema additions (052 — planned)

### `payment_webhook_events`

```sql
CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  idempotency_key text NULL,
  order_id uuid NULL REFERENCES public.orders(id),
  payment_id uuid NULL REFERENCES public.payments(id),
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'processed',
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_provider_event_unique
    UNIQUE (provider, provider_event_id)
);
```

### `payments` constraints (additive)

```sql
-- Unique where not null
CREATE UNIQUE INDEX payments_provider_payment_id_unique
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
```

### `orders` idempotency (optional)

```sql
ALTER TABLE public.orders ADD COLUMN idempotency_key text NULL;
CREATE UNIQUE INDEX orders_idempotency_key_unique
  ON public.orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
```

---

## 6. Integration with existing RPCs

| Event | RPC |
|-------|-----|
| Payment succeeded | `confirm_payment_atomic(p_order_id, p_payment_id, ...)` |
| Payment failed | `fail_payment_atomic(...)` |
| Refund completed | Future refund RPC or extend 024 patterns |

Existing `confirm_payment_atomic` already handles order status transition — adapter must not bypass it.

---

## 7. Currency handling

**Until 065:** Convert `numeric(12,2)` ↔ minor units at adapter boundary:

```typescript
const amountMinor = Math.round(parseFloat(amount) * 100);
```

**After 065:** Read/write `amount_minor` as canonical; keep numeric for historical display.

**Default currency:** TRY — never EUR as default.

---

## 8. Stub adapter (development)

For E2E before provider selection:

- `createCheckoutSession` → returns fake redirect URL
- Webhook simulator endpoint for tests
- Calls real `confirm_payment_atomic` with test provider code `'stub'`

---

## 9. Refunds (future)

Independent lifecycle: REQUESTED → PROCESSING → COMPLETED | FAILED  
Use existing `refund_records` table; adapter implements provider refund API.  
AI must not trigger refunds autonomously.

---

## 10. Security

- Webhook routes: service role only for RPC calls
- Signature verification mandatory
- Idempotency before any financial side effect
- Log raw payload in `payment_webhook_events` (PII minimization where possible)
- Rate limit webhook endpoint

---

## 11. Provider selection (business decision — not blocking architecture)

When ready, evaluate:
- Merchant account availability in KKTC/TR
- TRY support
- 3DS requirements
- Refund API
- Webhook reliability

Architecture remains unchanged regardless of choice.

---

## 12. Test requirements

- Duplicate webhook → single payment effect
- Invalid signature → 401, no RPC call
- confirm_payment_atomic failure → webhook marked failed, retry-safe
- Stub E2E: checkout → webhook → paid order → ticket issued
