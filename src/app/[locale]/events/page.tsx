import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DiscoveryFilterForm } from "@/components/discovery/DiscoveryFilterForm";
import { DiscoveryPagination } from "@/components/discovery/DiscoveryPagination";
import { EventGrid } from "@/components/events/EventGrid";
import { discoveryEventsRepository } from "@/lib/data/discovery-repository";
import { DISCOVERY_DEFAULT_PAGE_SIZE } from "@/lib/discovery/pagination";
import { parseDiscoverySearchParams } from "@/lib/discovery/search-params";
import { buildItemListJsonLd } from "@/lib/seo/jsonld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const filters = parseDiscoverySearchParams(await searchParams);
  const t = await getTranslations({ locale, namespace: "listing" });

  const title = filters.q
    ? t("metaSearchTitle", { query: filters.q })
    : t("metaTitle");
  const path = locale === "tr" ? "/tr/etkinlikler" : "/en/events";

  return {
    title,
    description: t("metaDescription"),
    alternates: {
      canonical: `${SITE_URL}${path}`,
      languages: {
        tr: `${SITE_URL}/tr/etkinlikler`,
        en: `${SITE_URL}/en/events`,
      },
    },
    openGraph: {
      title,
      description: t("metaDescription"),
      url: `${SITE_URL}${path}`,
      type: "website",
    },
  };
}

export default async function EventsListingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const filters = parseDiscoverySearchParams(await searchParams);
  const eventFilters =
    filters.scope === "venue" ? { ...filters, scope: undefined as undefined } : filters;

  const page = eventFilters.page ?? 1;
  const result = await discoveryEventsRepository.searchPage(eventFilters, {
    page,
    limit: DISCOVERY_DEFAULT_PAGE_SIZE,
  });

  const t = await getTranslations("listing");

  const itemListJsonLd = buildItemListJsonLd(
    result.items,
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
        {t("resultCount", { count: result.total })}
      </p>

      {result.items.length > 0 ? (
        <>
          <EventGrid events={result.items} priorityFirst={4} />
          <DiscoveryPagination
            locale={locale}
            filters={eventFilters}
            page={result.page}
            pageCount={result.pageCount}
            prevLabel={t("prevPage")}
            nextLabel={t("nextPage")}
            pageLabel={t("pageLabel")}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
          <p className="text-lg font-medium text-slate-700">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm text-slate-500">{t("emptyHint")}</p>
        </div>
      )}
    </section>
  );
}
