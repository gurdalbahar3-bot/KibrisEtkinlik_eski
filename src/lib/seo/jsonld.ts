import type { Locale } from "@/lib/i18n/routing";
import type { DiscoveryEvent } from "@/types/event";

const TR_MONTHS = [
  "OCAK",
  "ŞUBAT",
  "MART",
  "NİSAN",
  "MAYIS",
  "HAZİRAN",
  "TEMMUZ",
  "AĞUSTOS",
  "EYLÜL",
  "EKİM",
  "KASIM",
  "ARALIK",
];

const EN_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const TR_DAYS = [
  "PAZAR",
  "PAZARTESİ",
  "SALI",
  "ÇARŞAMBA",
  "PERŞEMBE",
  "CUMA",
  "CUMARTESİ",
];

const EN_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function formatEventDate(dateStr: string, locale: Locale) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDate();
  const month = locale === "tr" ? TR_MONTHS[date.getMonth()] : EN_MONTHS[date.getMonth()];
  const weekday =
    locale === "tr" ? TR_DAYS[date.getDay()] : EN_DAYS[date.getDay()];
  return { day, month, weekday };
}

export function eventToJsonLd(event: DiscoveryEvent, locale: Locale, siteUrl: string) {
  const path = locale === "tr" ? `/tr/etkinlikler/${event.slug}` : `/en/events/${event.slug}`;
  return {
    "@type": "Event",
    name: event.title,
    startDate: `${event.date}T${event.startTime}:00`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: event.district,
        addressCountry: "CY",
      },
    },
    image: event.poster,
    description: event.description,
    url: `${siteUrl}${path}`,
    offers: event.isFree
      ? {
          "@type": "Offer",
          price: "0",
          priceCurrency: "TRY",
          availability: "https://schema.org/InStock",
        }
      : undefined,
  };
}

export function buildWebsiteJsonLd(siteUrl: string, locale: Locale) {
  const searchPath = locale === "tr" ? "/tr/etkinlikler" : "/en/events";

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Kıbrıs Etkinlik",
    url: `${siteUrl}/${locale}`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}${searchPath}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildItemListJsonLd(
  events: DiscoveryEvent[],
  locale: Locale,
  siteUrl: string,
  listName: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}${locale === "tr" ? `/tr/etkinlikler/${event.slug}` : `/en/events/${event.slug}`}`,
    })),
  };
}
