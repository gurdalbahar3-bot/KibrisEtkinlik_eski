import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export type CustomerOrderSummary = {
  id: string;
  eventId: string;
  eventTitle: string | null;
  status: string;
  totalAmount: number;
  currency: string | null;
  expiresAt: string;
  createdAt: string;
  itemLabel: string | null;
  quantity: number;
};

export type CustomerOrderDetail = CustomerOrderSummary & {
  items: Array<{
    id: string;
    itemType: string;
    snapshotLabel: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    zoneId: string | null;
    referenceId: string | null;
  }>;
};

export type CustomerTicketRow = {
  id: string;
  eventId: string;
  eventTitle: string | null;
  ticketTypeId: string;
  zoneId: string;
  orderId: string;
  status: string;
  createdAt: string;
};

type OrderRow = {
  id: string;
  event_id: string;
  status: string;
  total_amount: number | string;
  currency: string | null;
  expires_at: string;
  created_at: string;
  events: { title: string } | { title: string }[] | null;
  order_items:
    | Array<{
        id: string;
        item_type: string;
        snapshot_label: string | null;
        quantity: number;
        unit_price: number | string;
        total_price: number | string;
        zone_id: string | null;
        reference_id: string | null;
      }>
    | null;
};

function asNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstEventTitle(
  events: OrderRow["events"]
): string | null {
  if (!events) return null;
  const row = Array.isArray(events) ? events[0] : events;
  return row?.title?.trim() || null;
}

function mapOrderSummary(row: OrderRow): CustomerOrderSummary {
  const items = row.order_items ?? [];
  const first = items[0];
  const quantity = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: firstEventTitle(row.events),
    status: row.status,
    totalAmount: asNumber(row.total_amount),
    currency: row.currency,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    itemLabel: first?.snapshot_label ?? null,
    quantity,
  };
}

/** Best-effort server-clock expire; never throws to the page. */
export async function expireDuePendingOrders(): Promise<void> {
  if (!getSupabasePublicEnv()) return;
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("expire_due_pending_orders_atomic");
  } catch {
    // Expire is opportunistic for account views.
  }
}

export async function listCustomerOrders(
  customerId: string
): Promise<CustomerOrderSummary[]> {
  if (!getSupabasePublicEnv()) return [];

  await expireDuePendingOrders();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      event_id,
      status,
      total_amount,
      currency,
      expires_at,
      created_at,
      events ( title ),
      order_items (
        id,
        item_type,
        snapshot_label,
        quantity,
        unit_price,
        total_price,
        zone_id,
        reference_id
      )
    `
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as unknown as OrderRow[]).map(mapOrderSummary);
}

export async function getCustomerOrder(
  customerId: string,
  orderId: string
): Promise<CustomerOrderDetail | null> {
  if (!getSupabasePublicEnv()) return null;

  await expireDuePendingOrders();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      event_id,
      status,
      total_amount,
      currency,
      expires_at,
      created_at,
      events ( title ),
      order_items (
        id,
        item_type,
        snapshot_label,
        quantity,
        unit_price,
        total_price,
        zone_id,
        reference_id
      )
    `
    )
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as OrderRow;
  const summary = mapOrderSummary(row);
  return {
    ...summary,
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      itemType: item.item_type,
      snapshotLabel: item.snapshot_label,
      quantity: item.quantity,
      unitPrice: asNumber(item.unit_price),
      totalPrice: asNumber(item.total_price),
      zoneId: item.zone_id,
      referenceId: item.reference_id,
    })),
  };
}

export async function listCustomerTickets(
  holderId: string
): Promise<CustomerTicketRow[]> {
  if (!getSupabasePublicEnv()) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `
      id,
      event_id,
      ticket_type_id,
      zone_id,
      order_id,
      status,
      created_at,
      events ( title )
    `
    )
    .eq("holder_id", holderId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  type TicketRow = {
    id: string;
    event_id: string;
    ticket_type_id: string;
    zone_id: string;
    order_id: string;
    status: string;
    created_at: string;
    events: { title: string } | { title: string }[] | null;
  };

  return (data as unknown as TicketRow[]).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: firstEventTitle(row.events),
    ticketTypeId: row.ticket_type_id,
    zoneId: row.zone_id,
    orderId: row.order_id,
    status: row.status,
    createdAt: row.created_at,
  }));
}
