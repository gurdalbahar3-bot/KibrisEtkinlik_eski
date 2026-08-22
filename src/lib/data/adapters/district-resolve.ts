import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DbEventLocationRow, DbVenueRow } from "@/types/supabase/database";
import type { DistrictSlug } from "@/types/event";

const DISTRICT_TEXT_ALIASES: Record<string, DistrictSlug> = {
  lefkosa: "lefkosa",
  nicosia: "lefkosa",
  girne: "girne",
  kyrenia: "girne",
  gazimagusa: "gazimagusa",
  famagusta: "gazimagusa",
  magosa: "gazimagusa",
  guzelyurt: "guzelyurt",
  morphou: "guzelyurt",
  lefke: "lefke",
  lefka: "lefke",
  iskele: "iskele",
  trikomo: "iskele",
  "yeni iskele": "iskele",
};

function normalizeLocationText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  return text
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
    .replace(/ç/g, "c");
}

function districtFromText(text: string | null | undefined): DistrictSlug | null {
  const normalized = normalizeLocationText(text);
  if (!normalized) return null;
  if (DISTRICT_TEXT_ALIASES[normalized]) {
    return DISTRICT_TEXT_ALIASES[normalized];
  }
  if (DISTRICT_SLUGS.includes(normalized as DistrictSlug)) {
    return normalized as DistrictSlug;
  }
  return null;
}

function firstEventLocation(
  location: DbEventLocationRow | DbEventLocationRow[] | null | undefined
): DbEventLocationRow | null {
  if (!location) return null;
  return Array.isArray(location) ? (location[0] ?? null) : location;
}

/**
 * District resolution order (049 model, no events.district_id):
 * 1. event_locations.district → kktc_districts.code
 * 2. venues.district → kktc_districts.code
 * 3. event_locations city/region text
 * 4. venues city/region text
 */
export function resolveEventDistrict(
  venue: DbVenueRow | null | undefined,
  eventLocation: DbEventLocationRow | DbEventLocationRow[] | null | undefined
): DistrictSlug {
  const location = firstEventLocation(eventLocation);

  const fromEventLocationCode = location?.kktc_districts?.code;
  if (fromEventLocationCode && DISTRICT_SLUGS.includes(fromEventLocationCode as DistrictSlug)) {
    return fromEventLocationCode as DistrictSlug;
  }

  const fromVenueCode = venue?.kktc_districts?.code;
  if (fromVenueCode && DISTRICT_SLUGS.includes(fromVenueCode as DistrictSlug)) {
    return fromVenueCode as DistrictSlug;
  }

  const fromEventLocationText =
    districtFromText(location?.city) ?? districtFromText(location?.region);
  if (fromEventLocationText) return fromEventLocationText;

  const fromVenueText =
    districtFromText(venue?.city) ?? districtFromText(venue?.region);
  if (fromVenueText) return fromVenueText;

  return "lefkosa";
}

export function resolveVenueDistrict(venue: DbVenueRow): DistrictSlug {
  return resolveEventDistrict(venue, null);
}
