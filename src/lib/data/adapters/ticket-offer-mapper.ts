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

function normalizeSaleMode(raw: string | null | undefined): TicketSaleMode {
  return raw === "seat_based" ? "seat_based" : "ticket_based";
}

/** Public discovery must not present remaining/sold/stock as live sales. */
export function stripPublicLiveSalesSignals(
  offers: DiscoveryTicketOffer[]
): DiscoveryTicketOffer[] {
  return offers.map((offer) => ({
    ...offer,
    remaining: undefined,
    isSoldOut: false,
  }));
}

export function mapTicketTypeRowToOffer(
  row: DbEventTicketTypeRow
): DiscoveryTicketOffer | null {
  if (!row.is_active) return null;

  const zone = firstZone(row.event_ticket_zones);
  if (!zone || !zone.is_active) return null;

  const price = parsePrice(row.price);
  if (price === null || price < 0) return null;

  const saleMode = normalizeSaleMode(zone.sale_mode);

  return {
    id: row.id,
    name: row.name.trim(),
    zoneName: zone.name.trim(),
    zoneType: zone.zone_type,
    saleMode,
    price,
    description: row.description?.trim() || undefined,
    remaining: undefined,
    isSoldOut: false,
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
  if (offers.length === 0) return undefined;
  return Math.min(...offers.map((offer) => offer.price));
}
