import type { Metadata } from "next";

import type { Locale } from "@/lib/i18n/routing";
import type { DiscoveryEvent } from "@/types/event";

/** Minimal event-detail SEO helper for admin publish preview. */
export function eventDetailPaths(slug: string) {
  return {
    tr: `/tr/etkinlikler/${slug}`,
    en: `/en/events/${slug}`,
  };
}

export function buildEventDetailMetadata(
  event: DiscoveryEvent,
  locale: Locale,
  options: {
    title: string;
    description: string;
    siteName: string;
  }
): Metadata {
  const paths = eventDetailPaths(event.slug);
  const canonical = locale === "tr" ? paths.tr : paths.en;

  return {
    title: options.title,
    description: options.description,
    alternates: {
      canonical,
      languages: {
        tr: paths.tr,
        en: paths.en,
      },
    },
    openGraph: {
      title: options.title,
      description: options.description,
      siteName: options.siteName,
      images: event.poster ? [{ url: event.poster }] : undefined,
    },
  };
}
