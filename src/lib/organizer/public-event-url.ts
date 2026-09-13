import { buildDeterministicSlug } from "@/lib/data/adapters/slug";

/** Public discovery URL using existing deterministic slug (no new slug system). */
export function buildOrganizerPublicEventPath(
  locale: "tr" | "en",
  title: string,
  eventId: string
): string {
  const slug = buildDeterministicSlug(title, eventId);
  return locale === "en" ? `/en/events/${slug}` : `/tr/etkinlikler/${slug}`;
}
