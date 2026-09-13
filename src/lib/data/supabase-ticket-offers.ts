import { mapTicketTypeRowsToOffers } from "@/lib/data/adapters/ticket-offer-mapper";
import {
  EVENT_TICKET_TYPE_OFFER_SELECT,
  EVENT_TICKET_ZONE_OFFER_SELECT,
} from "@/lib/data/supabase/queries";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type {
  DbEventTicketTypeRow,
  DbEventTicketZoneRow,
} from "@/types/supabase/database";
import type { DiscoveryTicketOffer } from "@/types/event";

type TicketTypeOfferRow = Omit<DbEventTicketTypeRow, "event_ticket_zones">;

/**
 * Public ticket offers for an event detail page.
 *
 * Uses two flat anon SELECTs (types + zones) instead of a nested PostgREST
 * embed. Nested `event_ticket_types → event_ticket_zones` was producing
 * Supabase "Gateway Timeout" under RLS on published-event detail.
 *
 * Failures return [] so the event detail page can still render (official
 * ticket URL / free-entry fallback) instead of 500-ing the whole route.
 */
export async function fetchTicketOffersByEventId(
  eventId: string
): Promise<DiscoveryTicketOffer[]> {
  try {
    const supabase = createSupabaseAnonClient();

    const [typesRes, zonesRes] = await Promise.all([
      supabase
        .from("event_ticket_types")
        .select(EVENT_TICKET_TYPE_OFFER_SELECT)
        .eq("event_id", eventId)
        .eq("is_active", true),
      supabase
        .from("event_ticket_zones")
        .select(EVENT_TICKET_ZONE_OFFER_SELECT)
        .eq("event_id", eventId)
        .eq("is_active", true),
    ]);

    if (typesRes.error) {
      console.error(
        "[ticket-offers] types fetch failed:",
        typesRes.error.message,
        { eventId }
      );
      return [];
    }
    if (zonesRes.error) {
      console.error(
        "[ticket-offers] zones fetch failed:",
        zonesRes.error.message,
        { eventId }
      );
      return [];
    }

    const zonesById = new Map(
      ((zonesRes.data ?? []) as unknown as DbEventTicketZoneRow[]).map((zone) => [
        zone.id,
        zone,
      ])
    );

    const joined: DbEventTicketTypeRow[] = (
      (typesRes.data ?? []) as unknown as TicketTypeOfferRow[]
    ).map((row) => ({
      ...row,
      event_ticket_zones: zonesById.get(row.zone_id) ?? null,
    }));

    return mapTicketTypeRowsToOffers(joined);
  } catch (err) {
    console.error("[ticket-offers] unexpected failure:", err, { eventId });
    return [];
  }
}

export const supabaseTicketOffersRepository = {
  getByEventId: fetchTicketOffersByEventId,
};
