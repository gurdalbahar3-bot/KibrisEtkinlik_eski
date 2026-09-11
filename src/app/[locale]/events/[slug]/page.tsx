import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapsDirectionsChooser } from "@/components/discovery/MapsDirectionsChooser";
import { EventGrid } from "@/components/events/EventGrid";
import { EventShareButtons } from "@/components/events/EventShareButtons";
import { EventTableOffers } from "@/components/events/EventTableOffers";
import { EventTicketOffers } from "@/components/events/EventTicketOffers";
import { SectionHeader } from "@/components/home/SectionHeader";
import { PosterImage } from "@/components/ui/PosterImage";
import { Link } from "@/lib/i18n/navigation";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import { listActiveTablePackagesForEvent } from "@/lib/customer/table-offers";
import {
  discoveryEventsRepository,
  discoveryVenuesRepository,
} from "@/lib/data/discovery-repository";
import { resolveDiscoveryCommerceMode } from "@/lib/discovery/commerce-cta";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import { buildEventMapsDestination } from "@/lib/discovery/venue-directions";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { eventToJsonLd, formatEventDate } from "@/lib/seo/jsonld";
import type { DistrictSlug } from "@/types/event";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

/** Runtime discovery fetch — slug list comes from Supabase, not mock static params. */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  return DISTRICT_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });

  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    const tDist = await getTranslations({ locale, namespace: "districts" });
    const tPage = await getTranslations({ locale, namespace: "districtsPage" });
    const name = tDist(slug as DistrictSlug);
    const path =
      locale === "tr" ? `/tr/etkinlikler/${slug}` : `/en/events/${slug}`;
    const title = tPage("metaDistrictTitle", { district: name });
    const description = tPage("metaDistrictDescription", { district: name });

    return {
      title,
      description,
      alternates: {
        canonical: `${SITE_URL}${path}`,
        languages: {
          tr: `${SITE_URL}/tr/etkinlikler/${slug}`,
          en: `${SITE_URL}/en/events/${slug}`,
        },
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}${path}`,
        siteName: tMeta("siteName"),
        locale: locale === "tr" ? "tr_TR" : "en_GB",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  const event = await discoveryEventsRepository.getBySlug(slug);
  if (!event) return {};

  const path =
    locale === "tr" ? `/tr/etkinlikler/${slug}` : `/en/events/${slug}`;
  const image = getEventImage(event);
  const title = `${event.title} | ${tMeta("siteName")}`;

  return {
    title,
    description: event.description,
    alternates: {
      canonical: `${SITE_URL}${path}`,
      languages: {
        tr: `${SITE_URL}/tr/etkinlikler/${slug}`,
        en: `${SITE_URL}/en/events/${slug}`,
      },
    },
    openGraph: {
      title: event.title,
      description: event.description,
      url: `${SITE_URL}${path}`,
      siteName: tMeta("siteName"),
      images: image ? [{ url: image, alt: event.title }] : undefined,
      locale: locale === "tr" ? "tr_TR" : "en_GB",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: event.description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function EventOrDistrictPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    const tDist = await getTranslations("districts");
    const tSection = await getTranslations("districtsSection");
    const tPage = await getTranslations("districtsPage");
    const events = await discoveryEventsRepository.getByDistrict(
      slug as DistrictSlug
    );
    const venues = await discoveryVenuesRepository.getAll();
    const districtVenues = venues.filter((v) => v.district === slug);

    return (
      <section className="section-container py-12">
        <Link
          href="/"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← {tPage("backHome")}
        </Link>
        <header className="mb-8 mt-4">
          <h1 className="section-title">{tDist(slug as DistrictSlug)}</h1>
          <p className="section-subtitle">{tSection("subtitle")}</p>
          {districtVenues.length > 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              {tPage("venueRefs", { count: districtVenues.length })}
            </p>
          ) : null}
        </header>
        {events.length > 0 ? (
          <EventGrid events={events} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
            <p className="text-lg font-medium text-slate-700">
              {tPage("emptyTitle")}
            </p>
            <p className="mt-2 text-sm text-slate-500">{tPage("emptyHint")}</p>
          </div>
        )}
      </section>
    );
  }

  const event = await discoveryEventsRepository.getBySlug(slug);
  if (!event) notFound();

  const [venue, ticketOffers, tableOffers, relatedEvents] = await Promise.all([
    discoveryVenuesRepository.getBySlug(event.venueSlug),
    discoveryEventsRepository.getTicketOffers(event.id),
    listActiveTablePackagesForEvent(event.id),
    discoveryEventsRepository.getRelatedEvents(event, 4),
  ]);

  const t = await getTranslations("eventDetail");
  const tCat = await getTranslations("categories");
  const tDist = await getTranslations("districts");
  const { day, month, weekday } = formatEventDate(
    event.date,
    locale as "tr" | "en"
  );
  const imageSrc = getEventImage(event);
  const fallbackSources = getEventImageSources(event).filter(
    (url) => url !== imageSrc
  );
  const mapsDestination = buildEventMapsDestination(event, venue);
  const shareUrl =
    locale === "tr"
      ? `${SITE_URL}/tr/etkinlikler/${event.slug}`
      : `${SITE_URL}/en/events/${event.slug}`;

  const mode = resolveDiscoveryCommerceMode({
    ...event,
    hasTicketOffers: ticketOffers.some(
      (o) => o.saleMode === "ticket_based" && !o.isSoldOut
    ),
    hasReservationOffers: tableOffers.some((o) => !o.isSoldOut),
  });

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

      <Link
        href="/events"
        className="text-sm font-medium text-brand-700 hover:underline"
      >
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
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            {event.title}
          </h1>
          {event.artists && event.artists.length > 0 ? (
            <p className="mt-2 text-base font-medium text-slate-500">
              {event.artists.join(" · ")}
            </p>
          ) : event.artist ? (
            <p className="mt-2 text-base font-medium text-slate-500">
              {event.artist}
            </p>
          ) : null}
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            {event.description}
          </p>

          {event.startingPrice != null && (
            <p className="mt-4 text-base font-semibold text-slate-900">
              {event.isFree
                ? t("freeEntry")
                : t("fromPrice", {
                    price: formatTicketPrice(
                      event.startingPrice,
                      locale as "tr" | "en"
                    ),
                  })}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {(mode === "ticket" ||
              mode === "hybrid" ||
              mode === "external") && (
              <a
                href="#ticket-offers-title"
                className="btn-primary"
                data-testid="detail-buy-tickets-cta"
              >
                {event.officialTicketUrl
                  ? t("officialTickets")
                  : t("buyTickets")}
              </a>
            )}
            {(mode === "reservation" || mode === "hybrid") && (
              <a
                href="#table-offers-title"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-600 px-5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                data-testid="detail-reserve-table-cta"
              >
                {t("reserveTable")}
              </a>
            )}
            {mode === "free" && (
              <span className="inline-flex min-h-[44px] items-center rounded-xl bg-emerald-50 px-5 text-sm font-semibold text-emerald-800">
                {t("joinEvent")}
              </span>
            )}
          </div>

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
              <dd className="mt-1 font-medium text-slate-900">
                {event.startTime}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("venue")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {venue ? (
                  <Link
                    href={{
                      pathname: "/venues/[slug]",
                      params: { slug: event.venueSlug },
                    }}
                    className="text-brand-700 hover:underline"
                  >
                    {event.venue}
                  </Link>
                ) : (
                  event.venue
                )}
              </dd>
            </div>
            {venue?.address ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("address")}
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {venue.address}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("district")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                <Link
                  href={{
                    pathname: "/events/[slug]",
                    params: { slug: event.district },
                  }}
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

          <EventShareButtons url={shareUrl} title={event.title} />

          <EventTicketOffers
            offers={ticketOffers}
            isFree={event.isFree}
            officialTicketUrl={event.officialTicketUrl}
            eventId={event.id}
          />

          <EventTableOffers offers={tableOffers} eventId={event.id} />
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
