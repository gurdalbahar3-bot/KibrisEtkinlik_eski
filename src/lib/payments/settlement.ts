/**
 * Pure helpers for building/validating VerifiedSettlement from provider retrieve.
 * No client entrypoint — only imported by server PaymentService / tests.
 */

import type {
  PaymentOutcome,
  RetrievePaymentResult,
  VerifiedSettlement,
} from "@/lib/payments/types";

export function parseIyzicoMoney(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Compare monetary amounts at kuruş precision. */
export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export type RetrieveSettlementGate =
  | { ok: true; settlement: VerifiedSettlement }
  | { ok: false; errorCode: string };

/**
 * Map provider retrieve → VerifiedSettlement. Never call with client-supplied
 * amount/status; `retrieved` must come from provider.retrievePayment.
 */
export function buildVerifiedSettlementFromRetrieve(input: {
  orderId: string;
  retrieved: RetrievePaymentResult;
  expectedConversationId: string;
}): RetrieveSettlementGate {
  const { orderId, retrieved, expectedConversationId } = input;

  if (!retrieved.providerPaymentId?.trim()) {
    return { ok: false, errorCode: "PROVIDER_PAYMENT_ID_REQUIRED" };
  }

  const conversationId = (retrieved.conversationId ?? "").trim();
  if (!conversationId || conversationId !== expectedConversationId) {
    return { ok: false, errorCode: "PAYMENT_ORDER_MISMATCH" };
  }
  if (conversationId !== orderId) {
    return { ok: false, errorCode: "PAYMENT_ORDER_MISMATCH" };
  }

  const currency = (retrieved.currency ?? "").trim().toUpperCase();
  if (!currency) {
    return { ok: false, errorCode: "CURRENCY_MISMATCH" };
  }

  if (!Number.isFinite(retrieved.amount) || retrieved.amount <= 0) {
    return { ok: false, errorCode: "AMOUNT_MISMATCH" };
  }

  // When both paidPrice (amount) and price are present, they must agree for MVP.
  if (
    retrieved.price != null &&
    Number.isFinite(retrieved.price) &&
    !moneyEquals(retrieved.amount, retrieved.price)
  ) {
    return { ok: false, errorCode: "AMOUNT_MISMATCH" };
  }

  const paymentStatus = (retrieved.paymentStatus ?? "").trim().toUpperCase();
  const fraudRaw = retrieved.fraudStatus;
  const fraud =
    fraudRaw == null || fraudRaw === ""
      ? null
      : Number.parseInt(String(fraudRaw), 10);

  if (paymentStatus !== "SUCCESS") {
    if (paymentStatus === "FAILURE" || retrieved.outcome === "failed") {
      return { ok: false, errorCode: "PAYMENT_STATUS_FAILED" };
    }
    return { ok: false, errorCode: "PAYMENT_STATUS_NOT_SUCCESS" };
  }

  if (fraud === 0) {
    return { ok: false, errorCode: "PAYMENT_FRAUD_REVIEW" };
  }
  if (fraud === -1) {
    return { ok: false, errorCode: "PAYMENT_FRAUD_REJECTED" };
  }
  if (fraud !== 1) {
    return { ok: false, errorCode: "PAYMENT_FRAUD_REVIEW" };
  }

  const outcome: PaymentOutcome =
    retrieved.outcome === "succeeded" ? "succeeded" : "failed";
  if (outcome !== "succeeded") {
    return { ok: false, errorCode: "PAYMENT_STATUS_NOT_SUCCESS" };
  }

  return {
    ok: true,
    settlement: {
      orderId,
      provider: "iyzico",
      providerPaymentId: retrieved.providerPaymentId.trim(),
      amount: retrieved.amount,
      currency,
      outcome: "succeeded",
      paymentMethod: "iyzico_checkout_form",
    },
  };
}

export function localePaymentResultPath(
  locale: string,
  kind: "success" | "failure",
  query?: Record<string, string | undefined>
): string {
  const base =
    kind === "success"
      ? locale === "en"
        ? "/en/checkout/success"
        : "/tr/odeme/basarili"
      : locale === "en"
        ? "/en/checkout/failure"
        : "/tr/odeme/basarisiz";
  if (!query) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
