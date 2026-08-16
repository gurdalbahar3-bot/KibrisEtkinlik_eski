import type { MetadataRoute } from "next";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import { MOCK_EVENTS, MOCK_VENUES } from "@/lib/data/mock-events";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["tr", "en"] as const;
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    const prefix = `${SITE_URL}/${locale}`;
    const eventsPath = locale === "tr" ? "etkinlikler" : "events";
    const categoriesPath = locale === "tr" ? "kategoriler" : "categories";
    const venuesPath = locale === "tr" ? "mekanlar" : "venues";
    const districtsPath = locale === "tr" ? "ilceler" : "districts";

    entries.push(
      { url: prefix, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
      { url: `${prefix}/${eventsPath}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
      { url: `${prefix}/${categoriesPath}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
      { url: `${prefix}/${venuesPath}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
      { url: `${prefix}/${districtsPath}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 }
    );

    for (const event of MOCK_EVENTS) {
      entries.push({
        url: `${prefix}/${eventsPath}/${event.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const district of DISTRICT_SLUGS) {
      entries.push({
        url: `${prefix}/${eventsPath}/${district}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.75,
      });
    }

    for (const category of CATEGORY_KEYS) {
      entries.push({
        url: `${prefix}/${categoriesPath}/${category}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const venue of MOCK_VENUES) {
      entries.push({
        url: `${prefix}/${venuesPath}/${venue.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.65,
      });
    }
  }

  return entries;
}
