import type { DiscoveryEvent } from "@/types/event";

export type DiscoveryCommerceMode =
  | "free"
  | "ticket"
  | "reservation"
  | "hybrid"
  | "external"
  | "info";

/**
 * Deterministic public CTA mode for cards + detail.
 * Client cannot invent payment — only safe navigation CTAs.
 */
export function resolveDiscoveryCommerceMode(
  event: Pick<
    DiscoveryEvent,
    | "isFree"
    | "officialTicketUrl"
    | "hasTicketOffers"
    | "hasReservationOffers"
  >
): DiscoveryCommerceMode {
  const hasTickets = Boolean(event.hasTicketOffers);
  const hasReservation = Boolean(event.hasReservationOffers);
  const hasOfficial = Boolean(event.officialTicketUrl?.trim());

  if (event.isFree && !hasTickets && !hasReservation && !hasOfficial) {
    return "free";
  }
  if (hasTickets && hasReservation) return "hybrid";
  if (hasReservation && !hasTickets) return "reservation";
  if (hasTickets) return "ticket";
  if (hasOfficial) return "external";
  return "info";
}
