import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HeroSearch } from "@/components/home/HeroSearch";
import { QuickFilters } from "@/components/home/HeroSearch";
import { TodayEvents } from "@/components/home/TodayEvents";
import { PopularEvents } from "@/components/home/PopularEvents";
import { WeekendEvents } from "@/components/home/WeekendEvents";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { DistrictGrid } from "@/components/home/DistrictGrid";
import { UpcomingEvents } from "@/components/home/UpcomingEvents";
import { VenueSection } from "@/components/home/VenueSection";
import { SeoContent } from "@/components/home/SeoContent";
import { BannerSlot } from "@/components/home/BannerSlot";
import { HOME_BANNER_SLOTS } from "@/lib/data/banner-slots";
import {
  districtsRepository,
  eventsRepository,
  venuesRepository,
} from "@/lib/data/events";
import { buildItemListJsonLd, buildWebsiteJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

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

  const [todayEvents, weekendEvents, districts, venues] = await Promise.all([
    eventsRepository.getToday(),
    eventsRepository.getWeekend(),
    districtsRepository.getAll(),
    venuesRepository.getAll(),
  ]);

  const todayIds = todayEvents.map((e) => e.id);
  const weekendIds = weekendEvents.map((e) => e.id);
  const featuredEvents = await eventsRepository.getFeaturedForHomepage([
    ...todayIds,
    ...weekendIds,
  ]);
  const featuredIds = featuredEvents.map((e) => e.id);
  const upcomingEvents = await eventsRepository.getUpcomingForHomepage([
    ...todayIds,
    ...weekendIds,
    ...featuredIds,
  ]);

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

      <HeroSearch />
      <QuickFilters />
      <TodayEvents events={todayEvents} />
      <BannerSlot slot={HOME_BANNER_SLOTS.afterToday} />
      <WeekendEvents events={weekendEvents} />
      <PopularEvents events={featuredEvents} />
      <CategoryGrid />
      <DistrictGrid districts={districts} />
      <UpcomingEvents events={upcomingEvents} />
      <BannerSlot slot={HOME_BANNER_SLOTS.beforeVenues} />
      <VenueSection venues={venues} />
      <SeoContent />
    </>
  );
}
