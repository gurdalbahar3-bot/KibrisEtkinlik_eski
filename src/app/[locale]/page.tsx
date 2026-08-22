import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DiscoveryHero } from "@/components/home/DiscoveryHero";
import { FeaturedEvents } from "@/components/home/FeaturedEvents";
import { TodayEvents } from "@/components/home/TodayEvents";
import { WeekendEvents } from "@/components/home/WeekendEvents";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { DistrictGrid } from "@/components/home/DistrictGrid";
import { UpcomingEvents } from "@/components/home/UpcomingEvents";
import { VenueSection } from "@/components/home/VenueSection";
import { SeoContent } from "@/components/home/SeoContent";
import { loadHomepageDiscoveryData } from "@/lib/home/load-homepage-data";
import { buildItemListJsonLd, buildWebsiteJsonLd } from "@/lib/seo/jsonld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

/** Runtime fetch — avoids build-time Supabase dependency when env is staging-only. */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  const canonical = `${SITE_URL}/${locale}`;

  return {
    title: t("homeTitle"),
    description: t("homeDescription"),
    keywords: t("homeKeywords"),
    alternates: {
      canonical,
      languages: {
        tr: `${SITE_URL}/tr`,
        en: `${SITE_URL}/en`,
      },
    },
    openGraph: {
      title: t("homeTitle"),
      description: t("homeDescription"),
      url: canonical,
      siteName: t("siteName"),
      locale: locale === "tr" ? "tr_TR" : "en_GB",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("homeTitle"),
      description: t("homeDescription"),
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const {
    heroEvent,
    featuredEvents,
    todayPreview,
    weekendPreview,
    upcomingPreview,
    venues,
    districts,
    categoryCounts,
  } = await loadHomepageDiscoveryData();

  const tFeatured = await getTranslations({ locale, namespace: "featuredSection" });

  const websiteJsonLd = buildWebsiteJsonLd(SITE_URL, locale as "tr" | "en");
  const featuredListJsonLd = buildItemListJsonLd(
    featuredEvents,
    locale as "tr" | "en",
    SITE_URL,
    tFeatured("title")
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featuredListJsonLd) }}
      />

      <DiscoveryHero spotlight={heroEvent} />
      <FeaturedEvents events={featuredEvents} />
      <TodayEvents events={todayPreview} />
      <WeekendEvents events={weekendPreview} />
      <CategoryGrid categoryCounts={categoryCounts} />
      <DistrictGrid districts={districts} />
      <UpcomingEvents events={upcomingPreview} />
      <VenueSection venues={venues} />
      <SeoContent />
    </>
  );
}
