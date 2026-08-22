import { getTranslations } from "next-intl/server";
import { PlatformEventCard } from "@/components/home/PlatformEventCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { DiscoveryEvent } from "@/types/event";

interface UpcomingEventsProps {
  events: DiscoveryEvent[];
}

export async function UpcomingEvents({ events }: UpcomingEventsProps) {
  const t = await getTranslations("upcomingSection");

  if (events.length === 0) return null;

  return (
    <section
      id="yaklasan-etkinlikler"
      className="section-surface-white section-padding"
      aria-labelledby="upcoming-title"
    >
      <div className="section-container">
        <SectionHeader
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="upcoming-title"
          cta={{ href: "/events", label: t("viewAll") }}
          className="section-header-gap"
        />

        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3 lg:gap-6">
          {events.map((event) => (
            <li key={event.id} className="w-[min(260px,78vw)] shrink-0 snap-start sm:w-auto">
              <PlatformEventCard event={event} variant="compact" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
