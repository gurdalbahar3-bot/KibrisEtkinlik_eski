import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { getVenueImage, getVenueImageSources } from "@/lib/ui/venue-image";
import { PosterImage } from "@/components/ui/PosterImage";
import type { DiscoveryVenue } from "@/types/event";

interface PlatformVenueCardProps {
  venue: DiscoveryVenue;
  variant?: "featured" | "standard";
}

export async function PlatformVenueCard({ venue, variant = "standard" }: PlatformVenueCardProps) {
  const t = await getTranslations("venuesSection");
  const tDist = await getTranslations("districts");
  const tVenueType = await getTranslations("venueTypes");
  const isFeatured = variant === "featured";
  // No invented Unsplash when photo is empty — PosterImage falls back to gradient.
  const imageSrc = venue.photo?.trim() ? getVenueImage(venue) : "";
  const fallbackSources = venue.photo?.trim()
    ? getVenueImageSources(venue).filter((url) => url !== imageSrc)
    : [];

  return (
    <Link
      href={{ pathname: "/venues/[slug]", params: { slug: venue.slug } }}
      className={`platform-card group block ${isFeatured ? "" : "h-full"}`}
    >
      <div className={`relative overflow-hidden ${isFeatured ? "aspect-[16/9] sm:aspect-[21/9]" : "aspect-[16/10]"}`}>
        <PosterImage
          src={imageSrc}
          fallbackSources={fallbackSources}
          alt={venue.name}
          sizes={isFeatured ? "(max-width: 1024px) 100vw, 58vw" : "(max-width: 640px) 85vw, 25vw"}
          className="object-cover transition duration-200 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-platform-navy/70 via-transparent to-transparent" />
        {isFeatured && (
          <div className="absolute bottom-0 w-full p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent-300">
              {t("upcoming", { count: venue.upcomingEventCount })}
            </p>
            <h3 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{venue.name}</h3>
            <p className="mt-1 text-sm text-white/80">
              {tDist(venue.district)} ·{" "}
              {tVenueType(venue.venueType as "outdoor" | "culture" | "arena" | "beach")}
            </p>
          </div>
        )}
      </div>
      {!isFeatured && (
        <div className="p-4">
          <h3 className="font-bold text-platform-navy transition group-hover:text-brand-700">{venue.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{tDist(venue.district)}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent-600">
            <CalendarIcon />
            {t("upcoming", { count: venue.upcomingEventCount })}
          </p>
        </div>
      )}
    </Link>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
