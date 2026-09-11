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
  qrCodeId: string | null;
};

export type CustomerTicketDetail = CustomerTicketRow & {
  confirmedAt: string | null;
  venueName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  ticketTypeName: string | null;
  zoneName: string | null;
  qrToken: string | null;
  qrStatus: string | null;
  qrUsedAt: string | null;
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

type TicketListRow = {
  id: string;
  event_id: string;
  ticket_type_id: string;
  zone_id: string;
  order_id: string;
  status: string;
  created_at: string;
  qr_code_id: string | null;
  events: { title: string } | { title: string }[] | null;
};

function mapTicketRow(row: TicketListRow): CustomerTicketRow {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: firstEventTitle(row.events),
    ticketTypeId: row.ticket_type_id,
    zoneId: row.zone_id,
    orderId: row.order_id,
    status: row.status,
    createdAt: row.created_at,
    qrCodeId: row.qr_code_id,
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
      qr_code_id,
      events ( title )
    `
    )
    .eq("holder_id", holderId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as unknown as TicketListRow[]).map(mapTicketRow);
}

export async function listCustomerTicketsForOrder(
  holderId: string,
  orderId: string
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
      qr_code_id,
      events ( title )
    `
    )
    .eq("holder_id", holderId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as unknown as TicketListRow[]).map(mapTicketRow);
}

export async function getCustomerTicketDetail(
  holderId: string,
  ticketId: string
): Promise<CustomerTicketDetail | null> {
  if (!getSupabasePublicEnv()) return null;

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
      confirmed_at,
      qr_code_id,
      events (
        title,
        starts_at,
        ends_at,
        venues ( name )
      ),
      event_ticket_types ( name ),
      event_ticket_zones ( name )
    `
    )
    .eq("id", ticketId)
    .eq("holder_id", holderId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  type DetailRow = {
    id: string;
    event_id: string;
    ticket_type_id: string;
    zone_id: string;
    order_id: string;
    status: string;
    created_at: string;
    confirmed_at: string | null;
    qr_code_id: string | null;
    events:
      | {
          title: string;
          starts_at: string | null;
          ends_at: string | null;
          venues: { name: string } | { name: string }[] | null;
        }
      | {
          title: string;
          starts_at: string | null;
          ends_at: string | null;
          venues: { name: string } | { name: string }[] | null;
        }[]
      | null;
    event_ticket_types: { name: string } | { name: string }[] | null;
    event_ticket_zones: { name: string } | { name: string }[] | null;
  };

  const row = data as unknown as DetailRow;
  const event = Array.isArray(row.events) ? row.events[0] : row.events;
  const venueRaw = event?.venues ?? null;
  const venue = Array.isArray(venueRaw) ? venueRaw[0] : venueRaw;
  const typeRaw = row.event_ticket_types;
  const type = Array.isArray(typeRaw) ? typeRaw[0] : typeRaw;
  const zoneRaw = row.event_ticket_zones;
  const zone = Array.isArray(zoneRaw) ? zoneRaw[0] : zoneRaw;

  let qrToken: string | null = null;
  let qrStatus: string | null = null;
  let qrUsedAt: string | null = null;

  if (row.qr_code_id) {
    // qr_codes table not yet in generated Database types; RLS still applies.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: qr } = await (supabase as any)
      .from("qr_codes")
      .select("token, status, used_at")
      .eq("id", row.qr_code_id)
      .eq("holder_id", holderId)
      .maybeSingle();

    if (qr) {
      qrToken = qr.token as string;
      qrStatus = qr.status as string;
      qrUsedAt = (qr.used_at as string | null) ?? null;
    }
  }

  return {
    ...mapTicketRow({
      id: row.id,
      event_id: row.event_id,
      ticket_type_id: row.ticket_type_id,
      zone_id: row.zone_id,
      order_id: row.order_id,
      status: row.status,
      created_at: row.created_at,
      qr_code_id: row.qr_code_id,
      events: event ? { title: event.title } : null,
    }),
    confirmedAt: row.confirmed_at,
    venueName: venue?.name?.trim() || null,
    startsAt: event?.starts_at ?? null,
    endsAt: event?.ends_at ?? null,
    ticketTypeName: type?.name?.trim() || null,
    zoneName: zone?.name?.trim() || null,
    qrToken,
    qrStatus,
    qrUsedAt,
  };
}
