import { isReservedDistrictSlug } from "@/lib/discovery/resolve-slug";

const NON_ALNUM = /[^a-z0-9\s-]/g;
const MULTI_DASH = /-+/g;

/** Normalize text for slug base (ASCII, lowercase, trimmed). */
export function normalizeSlugText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "");
}

/** Deterministic slug: normalized title + short uuid suffix (no DB slug column yet). */
export function buildDeterministicSlug(title: string, id: string): string {
  const base = normalizeSlugText(title)
    .replace(NON_ALNUM, "")
    .replace(/\s+/g, "-")
    .replace(MULTI_DASH, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);

  const suffix = id.replace(/-/g, "").slice(0, 8);
  const safeBase = base.length > 0 ? base : "event";
  let slug = `${safeBase}-${suffix}`;

  if (isReservedDistrictSlug(slug)) {
    slug = `${safeBase}-event-${suffix}`;
  }

  return slug.slice(0, 100);
}

/** Venue slug from name + id — same suffix strategy as events. */
export function buildVenueSlug(name: string, id: string): string {
  return buildDeterministicSlug(name, id);
}
