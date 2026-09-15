import type { DiscoveryEvent } from "@/types/event";

const PLACEHOLDER_VENUE = "Venue TBD";

/**
 * True when the event has a real venue name + slug suitable for `/venues/[slug]`.
 * Never invents links for missing or placeholder venue data.
 */
export function hasEventVenueLink(event: Pick<DiscoveryEvent, "venue" | "venueSlug">): boolean {
  const slug = event.venueSlug?.trim();
  const name = event.venue?.trim();
  if (!slug || !name) return false;
  if (name === PLACEHOLDER_VENUE) return false;
  return true;
}
