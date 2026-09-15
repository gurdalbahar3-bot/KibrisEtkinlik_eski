import type { MetadataRoute } from "next";
import { CATEGORY_KEYS, DISTRICT_SLUGS } from "@/lib/data/categories";
import {
  discoveryEventsRepository,
  discoveryVenuesRepository,
} from "@/lib/data/discovery-repository";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kibrisetkinlik.com";

/** Runtime catalog — production never bakes mock event slugs into sitemap.xml. */
export const dynamic = "force-dynamic";

/**
 * Discovery-aligned sitemap.
 * Uses discoveryEventsRepository / discoveryVenuesRepository so
 * SUPABASE_DATA_SOURCE=mock|supabase stays consistent with homepage/listings.
 * Categories + district hubs are stable taxonomy routes (not row-driven).
 * force-dynamic: do not prerender against production supabase during `next build`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, venues] = await Promise.all([
    discoveryEventsRepository.getAll(),
    discoveryVenuesRepository.getAll(),
  ]);

  const locales = ["tr", "en"] as const;
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();

  function push(entry: MetadataRoute.Sitemap[number]) {
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    entries.push(entry);
  }

  for (const locale of locales) {
    const prefix = `${SITE_URL}/${locale}`;
    const eventsPath = locale === "tr" ? "etkinlikler" : "events";
    const categoriesPath = locale === "tr" ? "kategoriler" : "categories";
    const venuesPath = locale === "tr" ? "mekanlar" : "venues";
    const districtsPath = locale === "tr" ? "ilceler" : "districts";

    push({ url: prefix, lastModified: new Date(), changeFrequency: "daily", priority: 1 });
    push({
      url: `${prefix}/${eventsPath}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    });
    push({
      url: `${prefix}/${categoriesPath}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    });
    push({
      url: `${prefix}/${venuesPath}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    });
    push({
      url: `${prefix}/${districtsPath}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    });

    // District hub routes under /events/[slug] — listed before event detail slugs.
    for (const district of DISTRICT_SLUGS) {
      push({
        url: `${prefix}/${eventsPath}/${district}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.75,
      });
    }

    for (const event of events) {
      push({
        url: `${prefix}/${eventsPath}/${event.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const category of CATEGORY_KEYS) {
      push({
        url: `${prefix}/${categoriesPath}/${category}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const venue of venues) {
      push({
        url: `${prefix}/${venuesPath}/${venue.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.65,
      });
    }
  }

  return entries;
}
