import type { DiscoveryEvent, DiscoveryVenue } from "@/types/event";

/**
 * External maps URL — no embedded map library.
 * Coordinates when present; otherwise name + district search (venue-mapper contract).
 */
export function buildVenueDirectionsUrl(
  venue: Pick<DiscoveryVenue, "name" | "district" | "location">
): string {
  if (venue.location) {
    const { latitude, longitude } = venue.location;
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }

  return buildVenueSearchUrl(venue.name, venue.district);
}

export function buildEventDirectionsUrl(
  event: Pick<DiscoveryEvent, "venue" | "district">,
  venue?: Pick<DiscoveryVenue, "name" | "district" | "location"> | null
): string {
  if (venue?.location) {
    return buildVenueDirectionsUrl(venue);
  }

  return buildVenueSearchUrl(venue?.name ?? event.venue, event.district);
}

function buildVenueSearchUrl(name: string, district: string): string {
  const query = [name, district, "KKTC"].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
