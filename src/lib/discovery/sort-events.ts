import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import type { DiscoveryEvent } from "@/types/event";

export type SortKey = "date" | "upcoming";

export const DEFAULT_SORT: SortKey = "date";

function compareByDateTime(a: DiscoveryEvent, b: DiscoveryEvent): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

/** Sort events — no popularity/fake metrics. */
export function sortEvents(events: DiscoveryEvent[], sort: SortKey = DEFAULT_SORT): DiscoveryEvent[] {
  const sorted = [...events];

  if (sort === "upcoming") {
    const today = getCyprusDateString();
    return sorted.filter((e) => e.date >= today).sort(compareByDateTime);
  }

  return sorted.sort(compareByDateTime);
}
