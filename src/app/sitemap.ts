import type { MetadataRoute } from "next";
import { CATEGORY_KEYS, DISTRICT_SLUGS } from "@/lib/data/categories";
import { queryEventSlugs, queryVenueSlugs } from "@/lib/supabase/queries/discovery";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = ["tr", "en"] as const;
  const entries: MetadataRoute.Sitemap = [];

  const [eventSlugs, venueSlugs] = await Promise.all([
    queryEventSlugs().catch(() => [] as string[]),
    queryVenueSlugs().catch(() => [] as string[]),
  ]);

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

    for (const slug of eventSlugs) {
      entries.push({
        url: `${prefix}/${eventsPath}/${slug}`,
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

    for (const slug of venueSlugs) {
      entries.push({
        url: `${prefix}/${venuesPath}/${slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.65,
      });
    }
  }

  return entries;
}
