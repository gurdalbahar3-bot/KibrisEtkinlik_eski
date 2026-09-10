/**
 * Provider-agnostic payment reconciliation helpers (pure).
 * No auto-refund — classify late/duplicate/orphan states for ops (B4).
 */

export type ReconSessionStatus =
  | "created"
  | "redirected"
  | "awaiting_provider"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled";

export type ReconOrderStatus =
  | "pending_payment"
  | "paid"
  | "expired"
  | "failed"
  | "cancelled"
  | string;

export type PaymentReconFinding =
  | "OK"
  | "ORDER_PAID"
  | "PAYMENT_AFTER_EXPIRY"
  | "IN_FLIGHT_SESSION"
  | "STALE_IN_FLIGHT_SESSION"
  | "DUPLICATE_SUCCEEDED_SESSIONS"
  | "ORPHAN_PROVIDER_SUCCESS"
  | "ORDER_NOT_PAYABLE"
  | "MISSING_SESSION";

export type PaymentReconReport = {
  orderId: string;
  orderStatus: ReconOrderStatus;
  findings: PaymentReconFinding[];
  /** Sessions that should move to expired (abandoned / order expired). */
  sessionIdsToExpire: string[];
  /** True when provider success must NOT call confirm (late charge). */
  blockSettlement: boolean;
  /** Ops note — refund not automated in B4. */
  requiresManualReconciliation: boolean;
};

const IN_FLIGHT: ReadonlySet<string> = new Set([
  "created",
  "redirected",
  "awaiting_provider",
]);

export function isInFlightSessionStatus(status: string): boolean {
  return IN_FLIGHT.has(status);
}

/**
 * Classify order + sessions for safe reconciliation without mutating DB.
 */
export function buildPaymentReconReport(input: {
  orderId: string;
  orderStatus: ReconOrderStatus;
  orderExpiresAt: string;
  nowMs?: number;
  sessions: Array<{
    id: string;
    status: string;
    expiresAt: string;
  }>;
  /** Count of succeeded payment rows for this order. */
  succeededPaymentCount: number;
}): PaymentReconReport {
  const now = input.nowMs ?? Date.now();
  const orderExpiredByTime =
    new Date(input.orderExpiresAt).getTime() < now;
  const findings: PaymentReconFinding[] = [];
  const sessionIdsToExpire: string[] = [];

  if (input.orderStatus === "paid") {
    findings.push("ORDER_PAID");
  }

  if (
    input.orderStatus === "expired" ||
    (input.orderStatus === "pending_payment" && orderExpiredByTime)
  ) {
    findings.push("PAYMENT_AFTER_EXPIRY");
  }

  if (
    input.orderStatus !== "pending_payment" &&
    input.orderStatus !== "paid"
  ) {
    findings.push("ORDER_NOT_PAYABLE");
  }

  const succeededSessions = input.sessions.filter(
    (s) => s.status === "succeeded"
  );
  if (succeededSessions.length > 1) {
    findings.push("DUPLICATE_SUCCEEDED_SESSIONS");
  }

  if (input.sessions.length === 0 && input.orderStatus === "pending_payment") {
    findings.push("MISSING_SESSION");
  }

  for (const session of input.sessions) {
    if (!isInFlightSessionStatus(session.status)) continue;
    findings.push("IN_FLIGHT_SESSION");
    const sessionExpired = new Date(session.expiresAt).getTime() < now;
    if (sessionExpired || orderExpiredByTime || input.orderStatus === "expired") {
      findings.push("STALE_IN_FLIGHT_SESSION");
      sessionIdsToExpire.push(session.id);
    }
  }

  // Provider reported success after expiry — ops must reconcile; do not settle.
  const blockSettlement =
    findings.includes("PAYMENT_AFTER_EXPIRY") &&
    input.orderStatus !== "paid";

  if (blockSettlement) {
    findings.push("ORPHAN_PROVIDER_SUCCESS");
  }

  // Multiple succeeded payment rows is a ledger anomaly (unique provider id
  // should prevent cross-order reuse; same-order multi-pay is still a finding).
  if (input.succeededPaymentCount > 1) {
    findings.push("DUPLICATE_SUCCEEDED_SESSIONS");
  }

  const uniqueFindings = [...new Set(findings)];
  if (uniqueFindings.length === 0) {
    uniqueFindings.push("OK");
  }

  return {
    orderId: input.orderId,
    orderStatus: input.orderStatus,
    findings: uniqueFindings,
    sessionIdsToExpire: [...new Set(sessionIdsToExpire)],
    blockSettlement,
    requiresManualReconciliation:
      blockSettlement ||
      uniqueFindings.includes("DUPLICATE_SUCCEEDED_SESSIONS") ||
      uniqueFindings.includes("ORPHAN_PROVIDER_SUCCESS"),
  };
}

/**
 * Next session status after a settlement attempt (domain map).
 * Does not invent statuses outside payment_sessions CHECK.
 */
export function nextSessionStatusAfterSettle(input: {
  settlementOk: boolean;
  errorCode?: string | null;
  orderAlreadyPaid?: boolean;
}): ReconSessionStatus {
  if (input.orderAlreadyPaid || input.settlementOk) return "succeeded";
  if (
    input.errorCode === "PAYMENT_AFTER_EXPIRY" ||
    input.errorCode === "ORDER_NOT_PAYABLE" ||
    input.errorCode === "ORDER_EXPIRED"
  ) {
    return "expired";
  }
  return "failed";
}
