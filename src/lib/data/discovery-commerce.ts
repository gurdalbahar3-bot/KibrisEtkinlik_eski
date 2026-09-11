import { cache } from "react";

import { MOCK_TICKET_OFFERS_BY_EVENT_ID } from "@/lib/data/mock-ticket-offers";
import {
  assertSupabaseDataSourceReady,
  isSupabaseDataSource,
} from "@/lib/supabase/config";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type { DiscoveryEvent } from "@/types/event";

export type DiscoveryCommerceIndex = {
  ticketEventIds: Set<string>;
  reservationEventIds: Set<string>;
  /** Lowest active ticket price per event (TRY). */
  ticketStartingPrice: Map<string, number>;
  /** Lowest active package amount_due proxy (base or deposit) per event. */
  reservationStartingPrice: Map<string, number>;
};

function emptyIndex(): DiscoveryCommerceIndex {
  return {
    ticketEventIds: new Set(),
    reservationEventIds: new Set(),
    ticketStartingPrice: new Map(),
    reservationStartingPrice: new Map(),
  };
}

function mockCommerceIndex(): DiscoveryCommerceIndex {
  const index = emptyIndex();
  for (const [eventId, offers] of Object.entries(MOCK_TICKET_OFFERS_BY_EVENT_ID)) {
    const buyable = offers.filter((o) => !o.isSoldOut);
    if (buyable.length === 0) continue;
    index.ticketEventIds.add(eventId);
    index.ticketStartingPrice.set(
      eventId,
      Math.min(...buyable.map((o) => o.price))
    );
  }
  return index;
}

async function supabaseCommerceIndex(): Promise<DiscoveryCommerceIndex> {
  const supabase = createSupabaseAnonClient();
  const index = emptyIndex();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = supabase.from.bind(supabase) as (t: string) => any;

  const [ticketsRes, packagesRes] = await Promise.all([
    from("event_ticket_types")
      .select("event_id, price, is_active")
      .eq("is_active", true),
    from("table_packages")
      .select("event_id, base_price, deposit_amount, is_active")
      .eq("is_active", true),
  ]);

  if (ticketsRes.error) {
    throw new Error(
      `Supabase discovery ticket commerce fetch failed: ${ticketsRes.error.message}`
    );
  }
  if (packagesRes.error) {
    throw new Error(
      `Supabase discovery package commerce fetch failed: ${packagesRes.error.message}`
    );
  }

  for (const row of ticketsRes.data ?? []) {
    const eventId = String(row.event_id);
    const price = Number(row.price);
    if (!Number.isFinite(price)) continue;
    index.ticketEventIds.add(eventId);
    const prev = index.ticketStartingPrice.get(eventId);
    if (prev == null || price < prev) {
      index.ticketStartingPrice.set(eventId, price);
    }
  }

  for (const row of packagesRes.data ?? []) {
    const eventId = String(row.event_id);
    const base = Number(row.base_price);
    const deposit =
      row.deposit_amount == null ? null : Number(row.deposit_amount);
    const due =
      deposit != null && Number.isFinite(deposit) && deposit > 0
        ? deposit
        : base;
    if (!Number.isFinite(due)) continue;
    index.reservationEventIds.add(eventId);
    const prev = index.reservationStartingPrice.get(eventId);
    if (prev == null || due < prev) {
      index.reservationStartingPrice.set(eventId, due);
    }
  }

  return index;
}

/** One commerce index per request — avoids N+1 on listing/cards. */
export const loadDiscoveryCommerceIndex = cache(
  async (): Promise<DiscoveryCommerceIndex> => {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseCommerceIndex();
    }
    return mockCommerceIndex();
  }
);

export function applyCommerceIndex(
  events: DiscoveryEvent[],
  index: DiscoveryCommerceIndex
): DiscoveryEvent[] {
  return events.map((event) => {
    const hasTicketOffers = index.ticketEventIds.has(event.id);
    const hasReservationOffers = index.reservationEventIds.has(event.id);
    const ticketPrice = index.ticketStartingPrice.get(event.id);
    const reservationPrice = index.reservationStartingPrice.get(event.id);

    let startingPrice: number | undefined;
    if (ticketPrice != null && reservationPrice != null) {
      startingPrice = Math.min(ticketPrice, reservationPrice);
    } else if (ticketPrice != null) {
      startingPrice = ticketPrice;
    } else if (reservationPrice != null) {
      startingPrice = reservationPrice;
    } else if (event.isFree) {
      startingPrice = 0;
    }

    return {
      ...event,
      hasTicketOffers,
      hasReservationOffers,
      startingPrice,
    };
  });
}
