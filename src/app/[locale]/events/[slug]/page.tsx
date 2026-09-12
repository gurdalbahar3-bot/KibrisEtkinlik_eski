import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventGrid } from "@/components/events/EventGrid";
import { PosterImage } from "@/components/ui/PosterImage";
import { Link } from "@/lib/i18n/navigation";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import { discoveryEventsRepository } from "@/lib/data/discovery-repository";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { eventToJsonLd, formatEventDate } from "@/lib/seo/jsonld";
import type { DistrictSlug } from "@/types/event";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kibrisetkinlik.com";

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
      title: `${name} — ${locale === "tr" ? "Etkinlikler" : "Events"} | Kıbrıs Etkinlik`,
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
    title: `${event.title} | Kıbrıs Etkinlik`,
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

  const t = await getTranslations("eventDetail");
  const tCat = await getTranslations("categories");
  const tDist = await getTranslations("districts");
  const { day, month, weekday } = formatEventDate(event.date, locale as "tr" | "en");
  const imageSrc = getEventImage(event);
  const fallbackSources = getEventImageSources(event).filter((url) => url !== imageSrc);

  const jsonLd = eventToJsonLd(event, locale as "tr" | "en", SITE_URL);

  return (
    <article className="section-container py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ "@context": "https://schema.org", ...jsonLd }),
        }}
      />

      <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
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
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{event.title}</h1>
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
              <dd className="mt-1 font-medium text-slate-900">{event.venue}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("district")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{tDist(event.district)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("category")}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{tCat(event.category)}</dd>
            </div>
          </dl>

          {event.officialTicketUrl ? (
            <a
              href={event.officialTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-accent-500 px-6 font-semibold text-white transition hover:bg-accent-600"
            >
              {t("officialTickets")} →
            </a>
          ) : (
            <p className="mt-8 text-sm text-slate-500">
              {t("officialTickets")}: {t("comingSoon")}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
