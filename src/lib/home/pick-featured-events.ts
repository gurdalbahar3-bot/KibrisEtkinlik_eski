import type { DiscoveryEvent } from "@/types/event";

/** Pick up to `limit` events for homepage featured spotlight (popular first). */
export function pickFeaturedEvents(events: DiscoveryEvent[], limit = 4): DiscoveryEvent[] {
  return [...events]
    .sort((a, b) => Number(b.isPopular) - Number(a.isPopular))
    .slice(0, limit);
}

/** Featured block: prefer today's events, backfill from popular when needed. */
export function pickFeaturedForHomepage(
  todayEvents: DiscoveryEvent[],
  popularEvents: DiscoveryEvent[],
  limit = 4,
  excludeIds: Iterable<string> = []
): DiscoveryEvent[] {
  const excluded = new Set(excludeIds);
  const filteredToday = todayEvents.filter((e) => !excluded.has(e.id));
  const filteredPopular = popularEvents.filter((e) => !excluded.has(e.id));

  const fromToday = pickFeaturedEvents(filteredToday, limit);
  if (fromToday.length >= limit) return fromToday;

  const ids = new Set(fromToday.map((e) => e.id));
  const supplement = filteredPopular.filter((e) => !ids.has(e.id)).slice(0, limit - fromToday.length);
  return [...fromToday, ...supplement];
}
