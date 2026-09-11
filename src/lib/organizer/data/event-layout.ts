import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PackageSaleCategory } from "@/lib/reservation/capacity";

export type EventLayoutTableRow = {
  eventTableId: string;
  tableId: string;
  tableNumber: string;
  tableType: string | null;
  venueCapacity: number;
  maxGuests: number | null;
  isSellable: boolean;
  positionX: number | null;
  positionY: number | null;
  usedPasses: number;
  remaining: number;
};

export type EventTablePackageRow = {
  id: string;
  eventTableId: string;
  name: string;
  basePrice: number;
  depositAmount: number | null;
  saleCategory: string;
  description: string | null;
  isActive: boolean;
};

export type EventReservationSummary = {
  id: string;
  tableId: string;
  tableNumber: string;
  guestCount: number;
  status: string;
  customerId: string;
  packageName: string | null;
  createdAt: string;
};

export type EventLayoutCommerceBundle = {
  venueId: string;
  venueTables: Array<{
    id: string;
    tableNumber: string;
    capacity: number;
    tableType: string | null;
    positionX: number | null;
    positionY: number | null;
    areaName: string | null;
  }>;
  eventTables: EventLayoutTableRow[];
  packages: EventTablePackageRow[];
  reservations: EventReservationSummary[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedFrom = (table: string) => any;

function n(value: unknown): number {
  const x = typeof value === "number" ? value : Number(value);
  return Number.isFinite(x) ? x : 0;
}

function nNull(value: unknown): number | null {
  if (value == null) return null;
  const x = typeof value === "number" ? value : Number(value);
  return Number.isFinite(x) ? x : null;
}

export async function getOrganizerEventLayoutCommerce(
  eventId: string,
  venueId: string
): Promise<EventLayoutCommerceBundle> {
  const supabase = await createSupabaseServerClient();
  const from = supabase.from.bind(supabase) as UntypedFrom;

  const [vtRes, etRes, pkgRes, resRes, areasRes] = await Promise.all([
    from("venue_tables")
      .select(
        "id, table_number, capacity, table_type, position_x, position_y, area_id"
      )
      .eq("venue_id", venueId)
      .order("table_number", { ascending: true }),
    from("event_tables")
      .select("id, table_id, is_sellable, max_guests")
      .eq("event_id", eventId),
    from("table_packages")
      .select(
        "id, event_table_id, name, base_price, deposit_amount, sale_category, description, is_active"
      )
      .eq("event_id", eventId)
      .order("name", { ascending: true }),
    from("table_reservations")
      .select(
        "id, table_id, guest_count, status, customer_id, created_at, event_table_id"
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50),
    from("venue_areas").select("id, name").eq("venue_id", venueId),
  ]);

  const areaNameById = new Map<string, string>();
  for (const a of (areasRes.data ?? []) as Array<{ id: string; name: string }>) {
    areaNameById.set(a.id, a.name);
  }

  const venueTables = (
    (vtRes.data ?? []) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    tableNumber: String(row.table_number ?? ""),
    capacity: n(row.capacity),
    tableType: (row.table_type as string | null) ?? null,
    positionX: nNull(row.position_x),
    positionY: nNull(row.position_y),
    areaName: row.area_id
      ? areaNameById.get(String(row.area_id)) ?? null
      : null,
  }));

  const venueById = new Map(venueTables.map((t) => [t.id, t]));

  const eventTableRows = (etRes.data ?? []) as Array<{
    id: string;
    table_id: string;
    is_sellable: boolean;
    max_guests: number | null;
  }>;

  // Pass usage per event_table (confirmed/used reservations' guest_count as proxy when passes not readable)
  const reservationsRaw = (resRes.data ?? []) as Array<{
    id: string;
    table_id: string;
    guest_count: number | null;
    status: string;
    customer_id: string;
    created_at: string;
    event_table_id: string | null;
  }>;

  const usedByEventTable = new Map<string, number>();
  for (const r of reservationsRaw) {
    if (r.status !== "confirmed" && r.status !== "used") continue;
    const key = r.event_table_id ?? "";
    if (!key) continue;
    usedByEventTable.set(
      key,
      (usedByEventTable.get(key) ?? 0) + Math.max(0, r.guest_count ?? 0)
    );
  }

  const packages = ((pkgRes.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      eventTableId: String(row.event_table_id),
      name: String(row.name ?? ""),
      basePrice: n(row.base_price),
      depositAmount: nNull(row.deposit_amount),
      saleCategory: String(row.sale_category ?? "table"),
      description: (row.description as string | null) ?? null,
      isActive: Boolean(row.is_active),
    })
  );

  const packageNameByEventTable = new Map<string, string>();
  for (const p of packages) {
    if (p.isActive && !packageNameByEventTable.has(p.eventTableId)) {
      packageNameByEventTable.set(p.eventTableId, p.name);
    }
  }

  const eventTables: EventLayoutTableRow[] = eventTableRows.map((et) => {
    const vt = venueById.get(et.table_id);
    const effective = et.max_guests ?? vt?.capacity ?? 0;
    const used = usedByEventTable.get(et.id) ?? 0;
    return {
      eventTableId: et.id,
      tableId: et.table_id,
      tableNumber: vt?.tableNumber ?? et.table_id.slice(0, 8),
      tableType: vt?.tableType ?? null,
      venueCapacity: vt?.capacity ?? 0,
      maxGuests: et.max_guests,
      isSellable: et.is_sellable,
      positionX: vt?.positionX ?? null,
      positionY: vt?.positionY ?? null,
      usedPasses: used,
      remaining: Math.max(0, effective - used),
    };
  });

  const reservations: EventReservationSummary[] = reservationsRaw.map((r) => {
    const vt = venueById.get(r.table_id);
    return {
      id: r.id,
      tableId: r.table_id,
      tableNumber: vt?.tableNumber ?? r.table_id.slice(0, 8),
      guestCount: r.guest_count ?? 0,
      status: r.status,
      customerId: r.customer_id,
      packageName: r.event_table_id
        ? packageNameByEventTable.get(r.event_table_id) ?? null
        : null,
      createdAt: r.created_at,
    };
  });

  return {
    venueId,
    venueTables,
    eventTables,
    packages,
    reservations,
  };
}

export type { PackageSaleCategory };
