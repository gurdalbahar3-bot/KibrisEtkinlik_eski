import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { PosterImage } from "@/components/ui/PosterImage";
import { formatEventDate } from "@/lib/seo/jsonld";
import { hasEventVenueLink } from "@/lib/ui/event-venue-link";
import type { DiscoveryEvent } from "@/types/event";
import type { Locale } from "@/lib/i18n/routing";

type PlatformCardVariant = "hero" | "featured" | "standard" | "compact";

interface PlatformEventCardProps {
  event: DiscoveryEvent;
  variant?: PlatformCardVariant;
  priority?: boolean;
}

const IMAGE_ASPECT: Record<PlatformCardVariant, string> = {
  hero: "aspect-[16/10] sm:aspect-[16/9]",
  featured: "aspect-[4/5]",
  standard: "aspect-[4/5]",
  compact: "aspect-[3/2]",
};

export async function PlatformEventCard({
  event,
  variant = "standard",
  priority = false,
}: PlatformEventCardProps) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("eventCard");
  const tCat = await getTranslations("categories");
  const tDist = await getTranslations("districts");
  const { day, month, weekday } = formatEventDate(event.date, locale);

  const isCompact = variant === "compact";
  const isFeatured = variant === "featured" || variant === "standard";
  const imageSrc = getEventImage(event);
  const fallbackSources = getEventImageSources(event).filter((url) => url !== imageSrc);

  return (
    <article className="platform-card group flex h-full flex-col">
      <Link
        href={{ pathname: "/events/[slug]", params: { slug: event.slug } }}
        className={`relative block overflow-hidden ${IMAGE_ASPECT[variant]}`}
      >
        <PosterImage
          src={imageSrc}
          fallbackSources={fallbackSources}
          alt={event.title}
          sizes={
            variant === "hero"
              ? "(max-width: 1024px) 100vw, 66vw"
              : isFeatured
                ? "(max-width: 640px) 85vw, 22vw"
                : "(max-width: 640px) 78vw, 20vw"
          }
          className="object-cover transition duration-200 group-hover:scale-[1.02]"
          priority={priority}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-platform-navy/25 via-transparent to-transparent opacity-0 transition duration-200 group-hover:opacity-100" />
        <span className="absolute left-3 top-3 rounded-lg bg-accent-500/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-sm">
          {tCat(event.category)}
        </span>
        <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-2.5 py-1.5 text-center shadow-md backdrop-blur-sm">
          <p className="text-lg font-bold leading-none text-platform-navy">{day}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-accent-600">{month}</p>
        </div>
        {event.isFree && (
          <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold text-white shadow">
            {t("free")}
          </span>
        )}
      </Link>

      <div
        className={`flex flex-1 flex-col ${isCompact ? "gap-1 p-3" : isFeatured ? "gap-1.5 p-4" : "gap-2 p-4 sm:p-5"}`}
      >
        <Link href={{ pathname: "/events/[slug]", params: { slug: event.slug } }}>
          <h3
            className={`line-clamp-2 font-bold leading-snug text-platform-navy transition group-hover:text-brand-700 ${
              variant === "hero"
                ? "text-lg sm:text-xl"
                : isCompact
                  ? "text-sm"
                  : isFeatured
                    ? "text-[15px] sm:text-base"
                    : "text-base"
            }`}
          >
            {event.title}
          </h3>
        </Link>

        {event.artist && !isCompact && (
          <p className="line-clamp-1 text-xs font-medium text-slate-500">{event.artist}</p>
        )}

        <div className={`space-y-1 ${isCompact ? "text-xs" : "text-sm"} text-slate-600`}>
          <p className="flex items-center gap-1.5 line-clamp-1">
            <PinIcon className="shrink-0 text-accent-500" />
            <span className="min-w-0">
              {hasEventVenueLink(event) ? (
                <Link
                  href={{ pathname: "/venues/[slug]", params: { slug: event.venueSlug } }}
                  className="font-medium text-slate-700 underline-offset-2 transition hover:text-brand-700 hover:underline"
                >
                  {event.venue}
                </Link>
              ) : (
                event.venue
              )}
              <span className="text-slate-400"> · </span>
              {tDist(event.district)}
            </span>
          </p>
          {!isCompact && (
            <p className="flex items-center gap-1.5">
              <CalendarIcon className="shrink-0 text-brand-500" />
              <span>
                {weekday}, {event.startTime}
              </span>
            </p>
          )}
          {isCompact && (
            <p className="text-slate-500">
              {weekday} · {event.startTime}
            </p>
          )}
        </div>

        <p className={`mt-auto font-semibold text-platform-navy ${isCompact ? "text-xs" : "text-sm"}`}>
          {event.isFree ? t("free") : t("details")}
        </p>
      </div>
    </article>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${className ?? ""}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${className ?? ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
