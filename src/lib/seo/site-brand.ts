import type { Locale } from "@/lib/i18n/routing";

/** Public user-facing brand only. Do not use for backend/admin identifiers. */
export function publicSiteName(locale: Locale | string): string {
  return locale === "en" ? "Cyprus Events" : "Kıbrıs Etkinlik";
}
