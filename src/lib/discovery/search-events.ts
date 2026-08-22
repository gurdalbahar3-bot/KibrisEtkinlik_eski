import type { DiscoveryEvent } from "@/types/event";
import type { DiscoverySearchScope } from "@/lib/discovery/search-params";

/** Searchable text fields — title/artist/venue prioritized via any-match. */
function getSearchFields(event: DiscoveryEvent): string[] {
  return [
    event.title,
    event.artist ?? "",
    event.venue,
    event.venueSlug.replace(/-/g, " "),
    event.district,
    event.category,
    event.description,
  ];
}

export function eventMatchesQuery(event: DiscoveryEvent, q: string): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;

  return getSearchFields(event).some((field) => field.toLowerCase().includes(needle));
}

/** Scoped match for hero search (event vs artist). Venue scope routes to venues listing. */
export function eventMatchesScopedQuery(
  event: DiscoveryEvent,
  q: string,
  scope: Exclude<DiscoverySearchScope, "venue">
): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;

  if (scope === "artist") {
    return (event.artist ?? "").toLowerCase().includes(needle);
  }

  return eventMatchesQuery(event, needle);
}
