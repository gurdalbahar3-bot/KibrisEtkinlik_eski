/**
 * Customer checkout safety helpers (pure / server-importable without iyzico).
 * Never trust client amount/currency; only DB ledger fields.
 */

import { classifyTicketIssuance } from "../tickets/issuance.ts";

export type CheckoutOrderGateInput = {
  orderId: string;
  customerId: string;
  orderCustomerId: string;
  status: string;
  expiresAt: string;
  currency: string | null;
  totalAmount: number | string;
  /** Ignored — never used for authorization. */
  clientPrice?: number | null;
  clientCurrency?: string | null;
};

export type CheckoutOrderGateResult =
  | { ok: true; amount: number; currency: "TRY" }
  | { ok: false; errorCode: string };

export function evaluateCheckoutOrderGate(
  input: CheckoutOrderGateInput,
  nowMs = Date.now()
): CheckoutOrderGateResult {
  void input.clientPrice;
  void input.clientCurrency;

  if (!input.orderId || input.orderCustomerId !== input.customerId) {
    return { ok: false, errorCode: "FORBIDDEN" };
  }
  if (input.status === "paid") {
    return { ok: false, errorCode: "ORDER_ALREADY_PAID" };
  }
  if (input.status === "expired" || input.status === "cancelled") {
    return { ok: false, errorCode: "ORDER_NOT_PAYABLE" };
  }
  if (input.status !== "pending_payment") {
    return { ok: false, errorCode: "ORDER_NOT_PAYABLE" };
  }
  if (new Date(input.expiresAt).getTime() < nowMs) {
    return { ok: false, errorCode: "ORDER_EXPIRED" };
  }
  if (!input.currency?.trim()) {
    return { ok: false, errorCode: "ORDER_CURRENCY_MISSING" };
  }
  if (input.currency.trim().toUpperCase() !== "TRY") {
    return { ok: false, errorCode: "CURRENCY_MISMATCH" };
  }
  const amount =
    typeof input.totalAmount === "number"
      ? input.totalAmount
      : Number(input.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, errorCode: "INVALID_ORDER_TOTAL" };
  }
  return { ok: true, amount, currency: "TRY" };
}

/**
 * After DB says paid, tickets must be active with QR (confirm RPC contract).
 */
export function evaluatePaidTicketIntegrity(input: {
  orderStatus: string;
  tickets: Array<{ status: string; qrCodeId: string | null }>;
  expectedQuantity?: number;
}): {
  showSuccess: boolean;
  errorCode?: string;
} {
  const classified = classifyTicketIssuance({
    orderStatus: input.orderStatus,
    expectedQuantity: input.expectedQuantity ?? input.tickets.length,
    tickets: input.tickets.map((t, i) => ({
      id: `t${i}`,
      status: t.status,
      qrCodeId: t.qrCodeId,
      orderItemId: null,
    })),
  });
  if (classified.ok) {
    return { showSuccess: true };
  }
  if (classified.code === "ORDER_NOT_PAID") {
    return { showSuccess: false, errorCode: "PAYMENT_NOT_VERIFIED" };
  }
  if (classified.code === "PAID_WITHOUT_TICKETS") {
    return { showSuccess: false, errorCode: "PAID_WITHOUT_TICKETS" };
  }
  return { showSuccess: false, errorCode: "PAID_TICKETS_INCOMPLETE" };
}
