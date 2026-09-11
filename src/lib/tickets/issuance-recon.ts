import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  classifyTicketIssuance,
  type IssuanceRecoveryCode,
} from "@/lib/tickets/issuance";

export type TicketIssuanceReconReport = {
  orderId: string;
  orderStatus: string;
  expectedQuantity: number;
  ticketCount: number;
  activeWithQr: number;
  code: IssuanceRecoveryCode;
  ok: boolean;
  /** Ops guidance — never auto-issues tickets outside confirm_payment_atomic. */
  recoveryHint: string;
};

function recoveryHint(code: IssuanceRecoveryCode): string {
  switch (code) {
    case "OK":
      return "Issuance complete.";
    case "ORDER_NOT_PAID":
      return "Order is not paid; do not issue tickets.";
    case "PAID_WITHOUT_TICKETS":
      return "PAID without ticket rows — investigate reserve/confirm path; do not duplicate confirm blindly.";
    case "PAID_TICKETS_INCOMPLETE":
      return "Paid but tickets missing active+QR — escalate; confirm_payment is transactional.";
    case "QUANTITY_MISMATCH":
      return "Ticket row count ≠ order quantity — capacity/ledger audit required.";
    case "DUPLICATE_QR_RISK":
      return "Multiple tickets share a qr_code_id — data integrity incident.";
    default:
      return "Unknown issuance state.";
  }
}

/**
 * Service-role read-only reconciliation for paid orders.
 * Does not mutate tickets/QR (issuance stays in confirm_payment_atomic).
 */
export async function inspectPaidOrderTicketIssuance(
  orderId: string
): Promise<TicketIssuanceReconReport | null> {
  const admin = createSupabaseServiceRoleClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) return null;

  const orderRow = order as { id: string; status: string };

  const { data: itemsRaw } = await admin
    .from("order_items")
    .select("quantity, item_type")
    .eq("order_id", orderId);

  const items = (itemsRaw ?? []) as Array<{
    quantity: number;
    item_type: string;
  }>;

  const expectedQuantity = items
    .filter((i) => i.item_type === "ticket")
    .reduce((sum, i) => sum + (i.quantity ?? 0), 0);

  const { data: ticketsRaw } = await admin
    .from("tickets")
    .select("id, status, qr_code_id, order_item_id")
    .eq("order_id", orderId);

  const tickets = (ticketsRaw ?? []) as Array<{
    id: string;
    status: string;
    qr_code_id: string | null;
    order_item_id: string | null;
  }>;

  const snaps = tickets.map((t) => ({
    id: t.id,
    status: t.status,
    qrCodeId: t.qr_code_id,
    orderItemId: t.order_item_id,
  }));

  const classified = classifyTicketIssuance({
    orderStatus: orderRow.status,
    expectedQuantity: expectedQuantity > 0 ? expectedQuantity : snaps.length,
    tickets: snaps,
  });

  return {
    orderId: orderRow.id,
    orderStatus: orderRow.status,
    expectedQuantity,
    ticketCount: snaps.length,
    activeWithQr: classified.activeWithQr,
    code: classified.code,
    ok: classified.ok,
    recoveryHint: recoveryHint(classified.code),
  };
}
