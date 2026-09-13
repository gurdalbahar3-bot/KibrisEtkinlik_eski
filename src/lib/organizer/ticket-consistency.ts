import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventTicketConsistencyIssue =
  | "paid_requires_catalog"
  | "free_has_paid_tickets"
  | "free_conflict_with_paid_type";

export type EventTicketConsistencyResult =
  | { ok: true; hasPaidActiveTypes: boolean; hasActiveZone: boolean; hasActiveType: boolean }
  | { ok: false; issue: EventTicketConsistencyIssue };

type ZoneLite = { id: string; is_active: boolean };
type TypeLite = { id: string; zone_id: string; price: number | string; is_active: boolean };

function toPrice(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Load active zones/types and evaluate is_free ↔ paid catalog rules (app-layer). */
export async function evaluateEventTicketConsistency(
  eventId: string,
  isFree: boolean
): Promise<EventTicketConsistencyResult> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = supabase.from.bind(supabase) as (table: string) => any;

  const [zonesRes, typesRes] = await Promise.all([
    from("event_ticket_zones")
      .select("id, is_active")
      .eq("event_id", eventId)
      .eq("is_active", true),
    from("event_ticket_types")
      .select("id, zone_id, price, is_active")
      .eq("event_id", eventId)
      .eq("is_active", true),
  ]);

  const zones = (zonesRes.data ?? []) as ZoneLite[];
  const types = (typesRes.data ?? []) as TypeLite[];
  const activeZoneIds = new Set(zones.map((z) => z.id));
  const activeTypesInActiveZones = types.filter((t) => activeZoneIds.has(t.zone_id));
  const hasPaidActiveTypes = activeTypesInActiveZones.some((t) => toPrice(t.price) > 0);
  const hasActiveZone = zones.length > 0;
  const hasActiveType = activeTypesInActiveZones.length > 0;

  if (isFree && hasPaidActiveTypes) {
    return { ok: false, issue: "free_has_paid_tickets" };
  }

  if (!isFree && (!hasActiveZone || !hasActiveType)) {
    return { ok: false, issue: "paid_requires_catalog" };
  }

  return {
    ok: true,
    hasPaidActiveTypes,
    hasActiveZone,
    hasActiveType,
  };
}

/** Block creating/updating an active paid type on a free event. */
export function assertPaidTypeAllowedOnEvent(
  isFree: boolean,
  price: number,
  isActive: boolean
): EventTicketConsistencyIssue | null {
  if (isFree && isActive && price > 0) {
    return "free_conflict_with_paid_type";
  }
  return null;
}

/**
 * Public UI: show Ücretsiz only when flagged free AND no ticket offers exist.
 * Paid catalog presence must never show a Free badge.
 */
export function shouldShowFreeBadge(isFree: boolean, ticketOfferCount: number): boolean {
  return isFree && ticketOfferCount <= 0;
}
