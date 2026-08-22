import { EventCard } from "@/components/events/EventCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DiscoveryEvent } from "@/types/event";

interface EventGridProps {
  events: DiscoveryEvent[];
  priorityFirst?: number;
  emptyNamespace?: "todaySection" | "featuredSection" | "weekendSection" | "upcomingSection";
}

export function EventGrid({
  events,
  priorityFirst = 0,
  emptyNamespace = "todaySection",
}: EventGridProps) {
  if (events.length === 0) {
    return <EmptyState namespace={emptyNamespace} />;
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
