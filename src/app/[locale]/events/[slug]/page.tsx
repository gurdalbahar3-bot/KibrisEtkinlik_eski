import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapsDirectionsChooser } from "@/components/discovery/MapsDirectionsChooser";
import { EventGrid } from "@/components/events/EventGrid";
import { EventTicketOffers } from "@/components/events/EventTicketOffers";
import { SectionHeader } from "@/components/home/SectionHeader";
import { PosterImage } from "@/components/ui/PosterImage";
import { Link } from "@/lib/i18n/navigation";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import {
  discoveryEventsRepository,
  discoveryVenuesRepository,
} from "@/lib/data/discovery-repository";
import { buildEventMapsDestination } from "@/lib/discovery/venue-directions";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { eventToJsonLd, formatEventDate } from "@/lib/seo/jsonld";
import type { DistrictSlug } from "@/types/event";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

/** Runtime discovery fetch — slug list comes from Supabase, not mock static params. */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  // District hub routes only; event slugs resolve at request time via discovery repo.
  return DISTRICT_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    const tDist = await getTranslations({ locale, namespace: "districts" });
    const name = tDist(slug as DistrictSlug);
    return {
      title: `${name} — ${locale === "tr" ? "Etkinlikler" : "Events"} | Global Event Discovery`,
      description:
        locale === "tr"
          ? `${name} ilçesindeki konser, festival ve etkinlikleri keşfedin.`
          : `Discover concerts, festivals and events in ${name}.`,
    };
  }

  const event = await discoveryEventsRepository.getBySlug(slug);
  if (!event) return {};

  const path = locale === "tr" ? `/tr/etkinlikler/${slug}` : `/en/events/${slug}`;
  const image = getEventImage(event);

  return {
    title: `${event.title} | Global Event Discovery`,
    description: event.description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title: event.title,
      description: event.description,
      images: image ? [{ url: image }] : undefined,
      type: "website",
    },
  };
}

export default async function EventOrDistrictPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    const tDist = await getTranslations("districts");
    const tSection = await getTranslations("districtsSection");
    const events = await discoveryEventsRepository.getByDistrict(slug as DistrictSlug);

    return (
      <section className="section-container py-12">
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          ← {locale === "tr" ? "Ana sayfa" : "Home"}
        </Link>
        <header className="mb-8 mt-4">
          <h1 className="section-title">{tDist(slug as DistrictSlug)}</h1>
          <p className="section-subtitle">{tSection("subtitle")}</p>
        </header>
        <EventGrid events={events} />
      </section>
    );
  }

  const event = await discoveryEventsRepository.getBySlug(slug);
  if (!event) notFound();

  const [venue, ticketOffers, relatedEvents] = await Promise.all([
    discoveryVenuesRepository.getBySlug(event.venueSlug),
    discoveryEventsRepository.getTicketOffers(event.id),
    discoveryEventsRepository.getRelatedEvents(event, 4),
  ]);

  const t = await getTranslations("eventDetail");
  const tCat = await getTranslations("categories");
  const tDist = await getTranslations("districts");
  const { day, month, weekday } = formatEventDate(event.date, locale as "tr" | "en");
  const imageSrc = getEventImage(event);
  const fallbackSources = getEventImageSources(event).filter((url) => url !== imageSrc);
  const mapsDestination = buildEventMapsDestination(event, venue);

  const jsonLd = eventToJsonLd(event, locale as "tr" | "en", SITE_URL, {
    venue,
    ticketOffers,
  });

  return (
    <article className="section-container py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ "@context": "https://schema.org", ...jsonLd }),
        }}
      />

      <Link href="/events" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("back")}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-card">
          <PosterImage
            src={imageSrc}
            fallbackSources={fallbackSources}
            alt={event.title}
            className="object-cover"
            priority
          />
          {event.isFree && (
            <span className="absolute left-4 top-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow">
              {t("free")}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{event.title}</h1>
          {event.artist && (
            <p className="mt-2 text-base font-medium text-slate-500">{event.artist}</p>
          )}
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{event.description}</p>

          <dl className="mt-8 space-y-4 rounded-2xl bg-slate-50 p-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("date")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {day} {month} · {weekday}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("time")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{event.startTime}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("venue")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {venue ? (
                  <Link
                    href={{ pathname: "/venues/[slug]", params: { slug: event.venueSlug } }}
                    className="text-brand-700 hover:underline"
                  >
                    {event.venue}
                  </Link>
                ) : (
                  event.venue
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("district")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                <Link
                  href={{ pathname: "/events/[slug]", params: { slug: event.district } }}
                  className="text-brand-700 hover:underline"
                >
                  {tDist(event.district)}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("category")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                <Link
                  href={{
                    pathname: "/categories/[category]",
                    params: { category: event.category },
                  }}
                  className="text-brand-700 hover:underline"
                >
                  {tCat(event.category)}
                </Link>
              </dd>
            </div>
          </dl>

          {mapsDestination && (
            <div className="mt-6 flex flex-wrap gap-3">
              <MapsDirectionsChooser destination={mapsDestination} />
            </div>
          )}

          <EventTicketOffers
            offers={ticketOffers}
            isFree={event.isFree}
            officialTicketUrl={event.officialTicketUrl}
          />
        </div>
      </div>

      {relatedEvents.length > 0 && (
        <section className="mt-14" aria-labelledby="related-events-title">
          <SectionHeader
            title={t("relatedTitle")}
            subtitle={t("relatedSubtitle")}
            titleId="related-events-title"
            className="section-header-gap"
          />
          <EventGrid events={relatedEvents} />
        </section>
      )}
    </article>
  );
}
