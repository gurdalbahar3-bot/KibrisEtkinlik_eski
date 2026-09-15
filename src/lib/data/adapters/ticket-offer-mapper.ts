import type { DbEventTicketTypeRow, DbEventTicketZoneRow } from "@/types/supabase/database";
import type { DiscoveryTicketOffer, TicketSaleMode } from "@/types/event";

function firstZone(
  zone: DbEventTicketTypeRow["event_ticket_zones"]
): DbEventTicketZoneRow | null {
  if (!zone) return null;
  return Array.isArray(zone) ? (zone[0] ?? null) : zone;
}

function parsePrice(value: number | string): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Map DB `sale_mode` (`ticket_based` | `seat_based`) → discovery TicketSaleMode. */
function normalizeSaleMode(raw: string | null | undefined): TicketSaleMode {
  return raw === "seat_based" ? "seat_based" : "ticket_based";
}

function remainingForZone(zone: DbEventTicketZoneRow): number | undefined {
  if (normalizeSaleMode(zone.sale_mode) !== "ticket_based") return undefined;
  const remaining = zone.capacity - zone.sold_count - zone.reserved_count;
  return Number.isFinite(remaining) ? Math.max(0, remaining) : undefined;
}

export function mapTicketTypeRowToOffer(
  row: DbEventTicketTypeRow
): DiscoveryTicketOffer | null {
  if (!row.is_active) return null;

  const zone = firstZone(row.event_ticket_zones);
  if (!zone || !zone.is_active) return null;

  const price = parsePrice(row.price);
  if (price === null || price < 0) return null;

  const remaining = remainingForZone(zone);
  const saleMode = normalizeSaleMode(zone.sale_mode);

  return {
    id: row.id,
    eventId: row.event_id,
    zoneId: row.zone_id,
    name: row.name.trim(),
    zoneName: zone.name.trim(),
    zoneType: zone.zone_type,
    saleMode,
    price,
    maxPerOrder: row.max_per_order,
    description: row.description?.trim() || undefined,
    remaining,
    isSoldOut: remaining === 0,
  };
}

export function mapTicketTypeRowsToOffers(
  rows: DbEventTicketTypeRow[]
): DiscoveryTicketOffer[] {
  const offers = rows
    .map(mapTicketTypeRowToOffer)
    .filter((offer): offer is DiscoveryTicketOffer => offer !== null);

  return offers.sort((a, b) => {
    const zoneCmp = a.zoneName.localeCompare(b.zoneName, "tr");
    if (zoneCmp !== 0) return zoneCmp;
    if (a.price !== b.price) return a.price - b.price;
    return a.name.localeCompare(b.name, "tr");
  });
}

export function lowestOfferPrice(offers: DiscoveryTicketOffer[]): number | undefined {
  const available = offers.filter((offer) => !offer.isSoldOut);
  if (available.length === 0) return undefined;
  return Math.min(...available.map((offer) => offer.price));
}
