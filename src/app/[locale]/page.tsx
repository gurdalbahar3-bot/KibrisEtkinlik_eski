import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HeroSearch } from "@/components/home/HeroSearch";
import { QuickFilters } from "@/components/home/HeroSearch";
import { TodayEvents } from "@/components/home/TodayEvents";
import { PopularEvents } from "@/components/home/PopularEvents";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { DistrictGrid } from "@/components/home/DistrictGrid";
import { UpcomingEvents } from "@/components/home/UpcomingEvents";
import { VenueSection } from "@/components/home/VenueSection";
import { SeoContent } from "@/components/home/SeoContent";
import { BannerSlot } from "@/components/home/BannerSlot";
import { HOME_BANNER_SLOTS } from "@/lib/data/banner-slots";
import { eventsRepository } from "@/lib/data/events";
import { buildItemListJsonLd, buildWebsiteJsonLd } from "@/lib/seo/jsonld";

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

  const todayEvents = eventsRepository.getToday();
  const todayIds = todayEvents.map((e) => e.id);
  const popularEvents = eventsRepository.getPopularForHomepage(todayIds);
  const popularIds = popularEvents.map((e) => e.id);
  const upcomingEvents = eventsRepository.getUpcomingForHomepage([
    ...todayIds,
    ...popularIds,
  ]);

  const tPopular = await getTranslations({ locale, namespace: "popularSection" });

  const websiteJsonLd = buildWebsiteJsonLd(SITE_URL, locale as "tr" | "en");
  const popularListJsonLd = buildItemListJsonLd(
    popularEvents,
    locale as "tr" | "en",
    SITE_URL,
    tPopular("title")
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(popularListJsonLd) }}
      />

      <HeroSearch />
      <QuickFilters />
      <TodayEvents events={todayEvents} />
      <BannerSlot slot={HOME_BANNER_SLOTS.afterToday} />
      <PopularEvents events={popularEvents} />
      <CategoryGrid />
      <DistrictGrid />
      <UpcomingEvents events={upcomingEvents} />
      <BannerSlot slot={HOME_BANNER_SLOTS.beforeVenues} />
      <VenueSection />
      <SeoContent />
    </>
  );
}
