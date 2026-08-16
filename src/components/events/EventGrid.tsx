import { EventCard } from "@/components/events/EventCard";
import type { DiscoveryEvent } from "@/types/event";

interface EventGridProps {
  events: DiscoveryEvent[];
  priorityFirst?: number;
}

export function EventGrid({ events, priorityFirst = 0 }: EventGridProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map((event, index) => (
        <li key={event.id}>
          <EventCard event={event} priority={index < priorityFirst} />
        </li>
      ))}
    </ul>
  );
}
