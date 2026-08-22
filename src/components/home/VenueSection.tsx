import { getTranslations } from "next-intl/server";
import { PlatformVenueCard } from "@/components/home/PlatformVenueCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { DiscoveryVenue } from "@/types/event";

const FEATURED_VENUE_LIMIT = 4;

interface VenueSectionProps {
  /** Required — no silent mock fallback. Empty → section hidden. */
  venues: DiscoveryVenue[];
}

export async function VenueSection({ venues: preloadedVenues }: VenueSectionProps) {
  const t = await getTranslations("venuesSection");
  const venues = [...preloadedVenues]
    .sort((a, b) => b.upcomingEventCount - a.upcomingEventCount)
    .slice(0, FEATURED_VENUE_LIMIT);

  if (venues.length === 0) return null;

  return (
    <section id="populer-mekanlar" className="section-surface-white section-padding" aria-labelledby="venues-title">
      <div className="section-container">
        <SectionHeader
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="venues-title"
          cta={{ href: "/venues", label: t("viewAll") }}
          className="section-header-gap"
        />

        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4 lg:gap-6">
          {venues.map((venue) => (
            <li key={venue.id} className="w-[min(260px,78vw)] shrink-0 snap-start sm:w-auto">
              <PlatformVenueCard venue={venue} variant="standard" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
