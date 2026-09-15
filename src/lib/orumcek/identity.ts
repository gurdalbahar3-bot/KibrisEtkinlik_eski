import {
  normalizeCategorySlug,
  normalizeEventTitle,
  normalizeSearchText,
  normalizeVenueName,
} from "@/lib/admin/intake/normalize";
import { DISTRICT_SLUGS, CATEGORY_KEYS } from "@/lib/data/categories";
import { createEvidenceHash } from "@/lib/admin/intake/evidence";
import type { DistrictSlug, EventCategory } from "@/types/event";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

const DISTRICT_ALIASES: Record<string, DistrictSlug> = {
  lefkosa: "lefkosa",
  lefkosia: "lefkosa",
  nicosia: "lefkosa",
  girne: "girne",
  kyrenia: "girne",
  gazimagusa: "gazimagusa",
  famagusta: "gazimagusa",
  magosa: "gazimagusa",
  magusa: "gazimagusa",
  guzelyurt: "guzelyurt",
  morphou: "guzelyurt",
  lefke: "lefke",
  iskele: "iskele",
};

function foldDistrictToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "-");
}

export function tryResolveDistrict(rawDistrict?: string): DistrictSlug | undefined {
  if (!rawDistrict?.trim()) {
    return undefined;
  }
  const slug = foldDistrictToken(rawDistrict);
  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    return slug as DistrictSlug;
  }
  return DISTRICT_ALIASES[slug];
}

/**
 * Scan free text (venue, address, title) for a KKTC district alias.
 * Used by live-crawl mapping when the source has no structured district field.
 */
export function inferDistrictFromText(text?: string): DistrictSlug | undefined {
  if (!text?.trim()) {
    return undefined;
  }
  const direct = tryResolveDistrict(text);
  if (direct) {
    return direct;
  }

  const folded = foldDistrictToken(text);
  const needles: Array<[string, DistrictSlug]> = [
    ...DISTRICT_SLUGS.map((slug) => [slug, slug] as [string, DistrictSlug]),
    ...Object.entries(DISTRICT_ALIASES),
  ].sort((a, b) => b[0].length - a[0].length);

  for (const [needle, slug] of needles) {
    const pattern = new RegExp(`(^|-)${needle}(-|$)`);
    if (pattern.test(folded)) {
      return slug;
    }
  }
  return undefined;
}

const UNDATED_KEY = "undated";

export function normalizeIdentityTitle(title: string): string {
  return normalizeEventTitle(title);
}

export function normalizeIdentityVenue(venue?: string): string | undefined {
  if (!venue?.trim()) {
    return undefined;
  }
  return normalizeVenueName(venue);
}

export function normalizeIdentityDate(rawDate?: string, startsAt?: string): string | undefined {
  const candidate = rawDate?.trim() || startsAt?.trim();
  if (!candidate) {
    return undefined;
  }
  const isoDay = candidate.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoDay ? isoDay[1] : candidate.slice(0, 10);
}

export function resolveDistrictOrThrow(rawDistrict?: string): DistrictSlug {
  const district = tryResolveDistrict(rawDistrict);
  if (!district) {
    throw new Error(rawDistrict?.trim() ? `Unsupported spider district: ${rawDistrict}` : "Spider intake requires rawDistrict.");
  }
  return district;
}

export function resolveCategory(rawCategory?: string): EventCategory | undefined {
  if (!rawCategory?.trim()) {
    return undefined;
  }
  const slug = normalizeCategorySlug(rawCategory) as EventCategory;
  return CATEGORY_KEYS.includes(slug) ? slug : "other";
}

export function slugifyVenue(rawVenue?: string): string | undefined {
  const normalized = normalizeIdentityVenue(rawVenue);
  if (!normalized) {
    return undefined;
  }
  return normalized.replace(/\s+/g, "-");
}

export function combineDateTime(rawDate?: string, rawTime?: string): string | undefined {
  const day = normalizeIdentityDate(rawDate);
  if (!day) {
    return undefined;
  }
  const time = (rawTime?.trim() || "00:00").slice(0, 5);
  return `${day}T${time}:00.000Z`;
}

export function buildIdentityKey(title: string, district: string, dateKey?: string): string {
  return [
    normalizeIdentityTitle(title),
    normalizeSearchText(district),
    dateKey?.trim() || UNDATED_KEY,
  ].join("|");
}

export function identityKeyFromRaw(raw: RawSpiderEvent): string {
  const district = resolveDistrictOrThrow(raw.rawDistrict);
  const dateKey = normalizeIdentityDate(raw.rawDate) ?? UNDATED_KEY;
  return buildIdentityKey(raw.rawTitle, district, dateKey);
}

export function observationKeyFromRaw(raw: RawSpiderEvent): string {
  const parts = [
    raw.sourceUrl.trim().toLowerCase(),
    normalizeIdentityTitle(raw.rawTitle),
    normalizeIdentityDate(raw.rawDate) ?? "",
    (raw.rawTime ?? "").trim(),
    normalizeIdentityVenue(raw.rawVenue) ?? "",
  ];
  return createEvidenceHash(parts.join("|"));
}
