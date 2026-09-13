import { mapTicketTypeRowsToOffers } from "@/lib/data/adapters/ticket-offer-mapper";
import { EVENT_TICKET_OFFER_SELECT } from "@/lib/data/supabase/queries";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type { DbEventTicketTypeRow } from "@/types/supabase/database";
import type { DiscoveryTicketOffer } from "@/types/event";

export async function fetchTicketOffersByEventId(
  eventId: string
): Promise<DiscoveryTicketOffer[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("event_ticket_types")
    .select(EVENT_TICKET_OFFER_SELECT)
    .eq("event_id", eventId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Supabase ticket offers fetch failed: ${error.message}`);
  }

  return mapTicketTypeRowsToOffers((data ?? []) as unknown as DbEventTicketTypeRow[]);
}

export const supabaseTicketOffersRepository = {
  getByEventId: fetchTicketOffersByEventId,
};
