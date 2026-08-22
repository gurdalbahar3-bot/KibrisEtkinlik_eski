import { getTranslations } from "next-intl/server";
import { PlatformEventCard } from "@/components/home/PlatformEventCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { DiscoveryEvent } from "@/types/event";

interface FeaturedEventsProps {
  events: DiscoveryEvent[];
}

export async function FeaturedEvents({ events }: FeaturedEventsProps) {
  if (events.length === 0) return null;

  const t = await getTranslations("featuredSection");

  return (
    <section
      id="one-cikanlar"
      className="section-surface-white section-padding"
      aria-labelledby="featured-title"
    >
      <div className="section-container">
        <SectionHeader
          eyebrow={t("badge")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="featured-title"
          className="section-header-gap"
        />

        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4 lg:gap-6">
          {events.map((event, index) => (
            <li key={event.id} className="w-[min(240px,72vw)] shrink-0 snap-start sm:w-auto">
              <PlatformEventCard event={event} variant="featured" priority={index < 2} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
