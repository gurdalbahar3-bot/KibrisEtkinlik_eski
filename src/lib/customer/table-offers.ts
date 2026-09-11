import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeTableDepositDue,
  evaluateSharedTableCapacity,
} from "@/lib/reservation/capacity";

export type DiscoveryTablePackageOffer = {
  id: string;
  eventId: string;
  eventTableId: string;
  tableId: string;
  tableNumber: string;
  areaName: string | null;
  venueName: string | null;
  name: string;
  description: string | null;
  saleCategory: string;
  basePrice: number;
  depositAmount: number | null;
  amountDueNow: number;
  remaining: number;
  maxGuests: number;
  isSoldOut: boolean;
  /** Deterministic capacity source used for remaining seats display. */
  capacitySource: "entry_passes" | "reservation_guest_count";
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

/**
 * Active table packages for a published event, with remaining shared capacity.
 * Prefers entry_passes counts when readable; falls back to reservation guest_count.
 */
export async function listActiveTablePackagesForEvent(
  eventId: string
): Promise<DiscoveryTablePackageOffer[]> {
  const supabase = await createSupabaseServerClient();
  const from = supabase.from.bind(supabase) as UntypedFrom;

  const { data: eventRow } = await from("events")
    .select("id, status, is_wedding, venue_id")
    .eq("id", eventId)
    .maybeSingle();

  if (
    !eventRow ||
    eventRow.status !== "published" ||
    eventRow.is_wedding
  ) {
    return [];
  }

  const venueId = eventRow.venue_id as string | null;
  let venueName: string | null = null;
  if (venueId) {
    const { data: venue } = await from("venues")
      .select("id, name")
      .eq("id", venueId)
      .maybeSingle();
    venueName = venue?.name ? String(venue.name) : null;
  }

  const [pkgRes, etRes, resRes, passRes] = await Promise.all([
    from("table_packages")
      .select(
        "id, event_id, event_table_id, name, base_price, deposit_amount, sale_category, description, is_active"
      )
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    from("event_tables")
      .select("id, table_id, is_sellable, max_guests")
      .eq("event_id", eventId)
      .eq("is_sellable", true),
    from("table_reservations")
      .select("id, event_table_id, guest_count, status")
      .eq("event_id", eventId)
      .in("status", ["confirmed", "used"]),
    from("entry_passes")
      .select("id, parent_id, parent_type, status")
      .eq("event_id", eventId)
      .eq("parent_type", "table_reservation")
      .in("status", ["active", "used"]),
  ]);

  const eventTables = (etRes.data ?? []) as Array<{
    id: string;
    table_id: string;
    is_sellable: boolean;
    max_guests: number | null;
  }>;
  const eventTableById = new Map(eventTables.map((t) => [t.id, t]));
  const tableIds = [...new Set(eventTables.map((t) => t.table_id))];

  const venueById = new Map<
    string,
    { tableNumber: string; capacity: number; areaId: string | null }
  >();
  const areaNameById = new Map<string, string>();
  if (tableIds.length > 0) {
    const { data: vtRows } = await from("venue_tables")
      .select("id, table_number, capacity, area_id")
      .in("id", tableIds);
    const areaIds: string[] = [];
    for (const row of (vtRows ?? []) as Array<Record<string, unknown>>) {
      const areaId = row.area_id ? String(row.area_id) : null;
      if (areaId) areaIds.push(areaId);
      venueById.set(String(row.id), {
        tableNumber: String(row.table_number ?? ""),
        capacity: n(row.capacity),
        areaId,
      });
    }
    if (areaIds.length > 0 && venueId) {
      const { data: areas } = await from("venue_areas")
        .select("id, name")
        .eq("venue_id", venueId)
        .in("id", [...new Set(areaIds)]);
      for (const a of (areas ?? []) as Array<{ id: string; name: string }>) {
        areaNameById.set(a.id, a.name);
      }
    }
  }

  const reservations = (resRes.data ?? []) as Array<{
    id: string;
    event_table_id: string | null;
    guest_count: number | null;
    status: string;
  }>;

  const passesReadable = !passRes.error;
  const passes = passesReadable
    ? ((passRes.data ?? []) as Array<{
        id: string;
        parent_id: string;
        parent_type: string;
        status: string;
      }>)
    : [];

  // Deterministic: successful entry_passes read → pass counts; else guest_count.
  const resolvedSource: "entry_passes" | "reservation_guest_count" =
    passesReadable ? "entry_passes" : "reservation_guest_count";

  const reservationById = new Map(reservations.map((r) => [r.id, r]));
  const usedByEventTable = new Map<string, number>();

  if (passesReadable) {
    for (const pass of passes) {
      const res = reservationById.get(pass.parent_id);
      if (!res?.event_table_id) continue;
      usedByEventTable.set(
        res.event_table_id,
        (usedByEventTable.get(res.event_table_id) ?? 0) + 1
      );
    }
  } else {
    for (const r of reservations) {
      if (!r.event_table_id) continue;
      usedByEventTable.set(
        r.event_table_id,
        (usedByEventTable.get(r.event_table_id) ?? 0) +
          Math.max(0, r.guest_count ?? 0)
      );
    }
  }

  const offers: DiscoveryTablePackageOffer[] = [];

  for (const row of (pkgRes.data ?? []) as Array<Record<string, unknown>>) {
    const eventTableId = String(row.event_table_id);
    const et = eventTableById.get(eventTableId);
    if (!et) continue;

    const venue = venueById.get(et.table_id);
    const effective = et.max_guests ?? venue?.capacity ?? 0;
    const used = usedByEventTable.get(eventTableId) ?? 0;
    const capacityCheck = evaluateSharedTableCapacity({
      effectiveCapacity: effective,
      usedPassCount: used,
      requestedGuests: 1,
    });
    const remaining = Math.max(0, effective - used);
    const basePrice = n(row.base_price);
    const depositAmount = nNull(row.deposit_amount);
    let amountDueNow = basePrice;
    try {
      amountDueNow = computeTableDepositDue({
        basePrice,
        depositAmount,
      }).amountDueNow;
    } catch {
      continue;
    }

    offers.push({
      id: String(row.id),
      eventId: String(row.event_id),
      eventTableId,
      tableId: et.table_id,
      tableNumber: venue?.tableNumber ?? et.table_id.slice(0, 8),
      areaName: venue?.areaId
        ? areaNameById.get(venue.areaId) ?? null
        : null,
      venueName,
      name: String(row.name ?? ""),
      description: (row.description as string | null) ?? null,
      saleCategory: String(row.sale_category ?? "table"),
      basePrice,
      depositAmount,
      amountDueNow,
      remaining,
      maxGuests: effective,
      isSoldOut: !capacityCheck.ok || remaining <= 0,
      capacitySource: resolvedSource,
    });
  }

  return offers.sort((a, b) => {
    if (a.amountDueNow !== b.amountDueNow) {
      return a.amountDueNow - b.amountDueNow;
    }
    return a.name.localeCompare(b.name, "tr");
  });
}
