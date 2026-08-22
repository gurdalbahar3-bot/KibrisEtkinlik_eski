import { eventsRepository } from "@/lib/data/events";
import type { EventCategory } from "@/types/event";

export function getCategoryEventCount(category: EventCategory): number {
  return eventsRepository.getAll().filter((e) => e.category === category).length;
}

export function getCategoryEventCounts(
  categories: EventCategory[]
): Record<EventCategory, number> {
  const counts = {} as Record<EventCategory, number>;
  for (const cat of categories) {
    counts[cat] = getCategoryEventCount(cat);
  }
  return counts;
}
