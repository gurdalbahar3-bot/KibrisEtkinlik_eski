import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PosterImage } from "@/components/ui/PosterImage";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { hasEventVenueLink } from "@/lib/ui/event-venue-link";
import { formatEventDate } from "@/lib/seo/jsonld";
import type { DiscoveryEvent } from "@/types/event";
import type { Locale } from "@/lib/i18n/routing";

interface HeroSpotlightCardProps {
  event: DiscoveryEvent;
}

export async function HeroSpotlightCard({ event }: HeroSpotlightCardProps) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("hero");
  const tCat = await getTranslations("categories");
  const tDist = await getTranslations("districts");
  const tCard = await getTranslations("eventCard");
  const { day, month, weekday } = formatEventDate(event.date, locale);

  const imageSrc = getEventImage(event);
  const fallbackSources = getEventImageSources(event).filter((url) => url !== imageSrc);
  const eventHref = { pathname: "/events/[slug]" as const, params: { slug: event.slug } };

  return (
    <article className="hero-spotlight-card w-full max-w-sm lg:max-w-none lg:justify-self-end">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-accent-300">
        {t("spotlightLabel")}
      </p>

      <div className="group overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)]">
        <Link href={eventHref} className="relative block aspect-[16/10] sm:aspect-[5/3]">
          <PosterImage
            src={imageSrc}
            fallbackSources={fallbackSources}
            alt={event.title}
            sizes="(max-width: 1024px) 92vw, 420px"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-platform-navy/50 via-transparent to-transparent" />
          <span className="absolute left-3 top-3 rounded-lg bg-accent-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            {tCat(event.category)}
          </span>
          {event.isFree && (
            <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold text-white shadow">
              {tCard("free")}
            </span>
          )}
          <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 text-center shadow-md backdrop-blur-sm">
            <p className="text-xl font-bold leading-none text-platform-navy">{day}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-accent-600">{month}</p>
          </div>
        </Link>

        <div className="space-y-2 p-4 sm:p-5">
          <Link href={eventHref}>
            <h3 className="line-clamp-2 text-lg font-bold leading-snug text-platform-navy transition group-hover:text-brand-700">
              {event.title}
            </h3>
          </Link>
          {event.artist && (
            <p className="line-clamp-1 text-sm font-medium text-slate-500">{event.artist}</p>
          )}
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <PinIcon />
            <span className="min-w-0 line-clamp-1">
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
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarIcon />
            <span>
              {weekday} · {event.startTime}
            </span>
          </p>
          <Link
            href={eventHref}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent-500 px-4 text-sm font-semibold text-white transition hover:bg-accent-600"
          >
            {t("spotlightCta")}
          </Link>
        </div>
      </div>
    </article>
  );
}

function PinIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-accent-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
