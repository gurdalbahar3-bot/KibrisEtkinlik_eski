import type { DiscoveryEvent } from "@/types/event";

function dateDistanceDays(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime());
  return ms / 86_400_000;
}

function sortByDateProximity(events: DiscoveryEvent[], refDate: string): DiscoveryEvent[] {
  return [...events].sort(
    (a, b) =>
      dateDistanceDays(a.date, refDate) - dateDistanceDays(b.date, refDate) ||
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime)
  );
}

/**
 * Deterministic related events — category → district → date proximity.
 * No popularity or AI scoring.
 */
export function findRelatedEvents(
  event: DiscoveryEvent,
  pool: DiscoveryEvent[],
  limit: number
): DiscoveryEvent[] {
  const others = pool.filter((candidate) => candidate.id !== event.id);
  const picked: DiscoveryEvent[] = [];
  const seen = new Set<string>();

  const addFrom = (candidates: DiscoveryEvent[]) => {
    for (const candidate of sortByDateProximity(candidates, event.date)) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      picked.push(candidate);
      if (picked.length >= limit) return;
    }
  };

  addFrom(
    others.filter(
      (candidate) =>
        candidate.category === event.category && candidate.district === event.district
    )
  );
  if (picked.length < limit) {
    addFrom(others.filter((candidate) => candidate.category === event.category));
  }
  if (picked.length < limit) {
    addFrom(others.filter((candidate) => candidate.district === event.district));
  }
  if (picked.length < limit) {
    addFrom(others);
  }

  return picked.slice(0, limit);
}
