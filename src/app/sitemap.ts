import type { MetadataRoute } from "next";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import {
  discoveryEventsRepository,
  discoveryVenuesRepository,
} from "@/lib/data/discovery-repository";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

/**
 * Async sitemap via the discovery facade.
 * Mock by default; live slugs when SUPABASE_DATA_SOURCE=supabase.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, venues] = await Promise.all([
    discoveryEventsRepository.getAll(),
    discoveryVenuesRepository.getAll(),
  ]);

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

    for (const event of events) {
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

    for (const venue of venues) {
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
