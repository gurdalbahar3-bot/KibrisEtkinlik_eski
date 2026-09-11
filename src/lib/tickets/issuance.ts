/**
 * Ticket / QR issuance integrity helpers (pure).
 * Issuance itself remains confirm_payment_atomic (service_role, idempotent noop on paid).
 */

export const TICKET_STATUS = {
  pendingPayment: "pending_payment",
  active: "active",
  used: "used",
  transferred: "transferred",
  cancelledByOrganizer: "cancelled_by_organizer",
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const QR_STATUS = {
  active: "active",
  used: "used",
  revoked: "revoked",
  expired: "expired",
} as const;

export type IssuanceRecoveryCode =
  | "OK"
  | "ORDER_NOT_PAID"
  | "PAID_WITHOUT_TICKETS"
  | "PAID_TICKETS_INCOMPLETE"
  | "QUANTITY_MISMATCH"
  | "DUPLICATE_QR_RISK";

export type IssuanceTicketSnapshot = {
  id: string;
  status: string;
  qrCodeId: string | null;
  orderItemId: string | null;
};

/**
 * After a successful payment, tickets must be active with a bound QR.
 * Quantity > 1 ⇒ one ticket row per unit (existing reserve/confirm contract).
 */
export function classifyTicketIssuance(input: {
  orderStatus: string;
  expectedQuantity: number;
  tickets: IssuanceTicketSnapshot[];
}): { ok: boolean; code: IssuanceRecoveryCode; activeWithQr: number } {
  if (input.orderStatus !== "paid") {
    return { ok: false, code: "ORDER_NOT_PAID", activeWithQr: 0 };
  }

  if (!input.tickets.length) {
    return { ok: false, code: "PAID_WITHOUT_TICKETS", activeWithQr: 0 };
  }

  const activeWithQr = input.tickets.filter(
    (t) => t.status === TICKET_STATUS.active && Boolean(t.qrCodeId)
  ).length;

  if (activeWithQr !== input.tickets.length) {
    return { ok: false, code: "PAID_TICKETS_INCOMPLETE", activeWithQr };
  }

  if (
    Number.isFinite(input.expectedQuantity) &&
    input.expectedQuantity > 0 &&
    input.tickets.length !== input.expectedQuantity
  ) {
    return { ok: false, code: "QUANTITY_MISMATCH", activeWithQr };
  }

  const qrIds = input.tickets
    .map((t) => t.qrCodeId)
    .filter((id): id is string => Boolean(id));
  if (new Set(qrIds).size !== qrIds.length) {
    return { ok: false, code: "DUPLICATE_QR_RISK", activeWithQr };
  }

  return { ok: true, code: "OK", activeWithQr };
}

/**
 * Safe QR payload: opaque token only — never PII / order amounts / emails.
 */
export function buildTicketQrPayload(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("QR_TOKEN_REQUIRED");
  }
  return trimmed;
}

export function isSecureQrToken(token: string): boolean {
  // confirm_payment uses encode(gen_random_bytes(32), 'hex') → 64 hex chars
  return /^[0-9a-f]{64}$/i.test(token.trim());
}

export type CheckInPreflightInput = {
  selectedEventId: string;
  qrEventId: string | null;
  qrStatus: string | null;
  ticketStatus: string | null;
  entityType: string | null;
};

export type CheckInPreflightResult =
  | { ok: true }
  | { ok: false; errorCode: string };

/**
 * App-layer gates before use_qr_atomic. Server RPC remains source of truth.
 */
export function evaluateCheckInPreflight(
  input: CheckInPreflightInput
): CheckInPreflightResult {
  if (!input.qrEventId || !input.qrStatus) {
    return { ok: false, errorCode: "INVALID" };
  }
  if (input.qrEventId !== input.selectedEventId) {
    return { ok: false, errorCode: "WRONG_EVENT" };
  }
  if (input.entityType && input.entityType !== "ticket") {
    return { ok: false, errorCode: "UNSUPPORTED_ENTITY" };
  }
  if (input.qrStatus === QR_STATUS.revoked) {
    return { ok: false, errorCode: "REVOKED" };
  }
  if (input.qrStatus === QR_STATUS.expired) {
    return { ok: false, errorCode: "EXPIRED" };
  }
  if (input.qrStatus === QR_STATUS.used) {
    return { ok: false, errorCode: "ALREADY_USED" };
  }
  if (
    input.ticketStatus === TICKET_STATUS.cancelledByOrganizer ||
    input.ticketStatus === "cancelled"
  ) {
    return { ok: false, errorCode: "CANCELLED" };
  }
  if (
    input.ticketStatus &&
    input.ticketStatus !== TICKET_STATUS.active &&
    input.ticketStatus !== TICKET_STATUS.used
  ) {
    if (input.ticketStatus === TICKET_STATUS.pendingPayment) {
      return { ok: false, errorCode: "NOT_ACTIVE" };
    }
  }
  return { ok: true };
}

export function mapUseQrErrorToUiCode(errorCode: string | null | undefined): string {
  const code = (errorCode ?? "INVALID").toUpperCase();
  switch (code) {
    case "ALREADY_USED":
      return "ALREADY_USED";
    case "REVOKED":
      return "REVOKED";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "UNAUTHENTICATED":
      return "UNAUTHENTICATED";
    case "EVENT_POSTPONED":
      return "EVENT_POSTPONED";
    case "WRONG_EVENT":
      return "WRONG_EVENT";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "NOT_ACTIVE":
      return "NOT_ACTIVE";
    default:
      return "INVALID";
  }
}
