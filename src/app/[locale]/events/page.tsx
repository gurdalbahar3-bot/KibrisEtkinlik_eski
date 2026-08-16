import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DiscoveryFilterForm } from "@/components/discovery/DiscoveryFilterForm";
import { EventGrid } from "@/components/events/EventGrid";
import { eventsRepository } from "@/lib/data/events";
import { parseDiscoverySearchParams } from "@/lib/discovery/search-params";
import { buildItemListJsonLd } from "@/lib/seo/jsonld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const filters = parseDiscoverySearchParams(await searchParams);
  const t = await getTranslations({ locale, namespace: "listing" });

  const title = filters.q
    ? t("metaSearchTitle", { query: filters.q })
    : t("metaTitle");

  return {
    title,
    description: t("metaDescription"),
    alternates: {
      canonical: `${SITE_URL}/${locale}${locale === "tr" ? "/etkinlikler" : "/events"}`,
    },
  };
}

export default async function EventsListingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const filters = parseDiscoverySearchParams(await searchParams);
  const events = eventsRepository.search(filters);
  const t = await getTranslations("listing");

  const itemListJsonLd = buildItemListJsonLd(
    events,
    locale as "tr" | "en",
    SITE_URL,
    t("title")
  );

  return (
    <section className="section-container py-10 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-slate-600">{t("subtitle")}</p>
      </header>

      <DiscoveryFilterForm locale={locale} filters={filters} />

      <p className="my-6 text-sm text-slate-500">
        {t("resultCount", { count: events.length })}
      </p>

      {events.length > 0 ? (
        <EventGrid events={events} priorityFirst={4} />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
          <p className="text-lg font-medium text-slate-700">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm text-slate-500">{t("emptyHint")}</p>
        </div>
      )}
    </section>
  );
}
