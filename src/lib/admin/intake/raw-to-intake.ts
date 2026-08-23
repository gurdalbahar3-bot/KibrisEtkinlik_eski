import { createIntakeFingerprint } from "@/lib/admin/intake/fingerprint";
import {
  normalizeCategorySlug,
  normalizeDistrictSlug,
  normalizeEventTitle,
  normalizeVenueName,
} from "@/lib/admin/intake/normalize";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { CreateIntakeInput } from "@/types/admin/intake";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";
import type { DistrictSlug, EventCategory } from "@/types/event";

const DISTRICT_ALIASES: Record<string, DistrictSlug> = {
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
  iskele: "iskele",
};

function resolveDistrict(rawDistrict?: string): DistrictSlug {
  if (!rawDistrict?.trim()) {
    throw new Error("Spider intake requires rawDistrict.");
  }
  const slug = normalizeDistrictSlug(rawDistrict);
  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    return slug as DistrictSlug;
  }
  const alias = DISTRICT_ALIASES[slug];
  if (alias) {
    return alias;
  }
  throw new Error(`Unsupported spider district: ${rawDistrict}`);
}

function resolveCategory(rawCategory?: string): EventCategory | undefined {
  if (!rawCategory?.trim()) {
    return undefined;
  }
  const slug = normalizeCategorySlug(rawCategory) as EventCategory;
  return CATEGORY_KEYS.includes(slug) ? slug : "other";
}

function combineDateTime(rawDate?: string, rawTime?: string): string | undefined {
  if (!rawDate?.trim()) {
    return undefined;
  }
  const date = rawDate.trim();
  const time = (rawTime?.trim() || "00:00").slice(0, 5);
  return `${date}T${time}:00.000Z`;
}

function slugifyVenue(rawVenue?: string): string | undefined {
  if (!rawVenue?.trim()) {
    return undefined;
  }
  return normalizeVenueName(rawVenue).replace(/\s+/g, "-");
}

export function validateSpiderRawEvent(raw: RawSpiderEvent): void {
  if (!raw.sourceUrl?.trim()) {
    throw new Error("Spider intake requires sourceUrl.");
  }
  if (!raw.rawTitle?.trim()) {
    throw new Error("Spider intake requires rawTitle.");
  }
  if (!raw.evidence.length) {
    throw new Error("Spider intake requires at least one evidence record.");
  }
  for (const item of raw.evidence) {
    if (!item.sourceUrl?.trim() || !item.hash?.trim()) {
      throw new Error("Each spider evidence record requires sourceUrl and hash.");
    }
  }
}

export function mapRawSpiderEventToIntake(raw: RawSpiderEvent): CreateIntakeInput {
  validateSpiderRawEvent(raw);

  const district = resolveDistrict(raw.rawDistrict);
  const suggestedStartsAt = combineDateTime(raw.rawDate, raw.rawTime);
  const suggestedVenueId = slugifyVenue(raw.rawVenue);
  const normalizedTitle = normalizeEventTitle(raw.rawTitle);

  const fingerprint = createIntakeFingerprint({
    title: normalizedTitle,
    district,
    venue: suggestedVenueId,
    startsAt: suggestedStartsAt,
  });

  return {
    status: "DISCOVERED",
    source: "SPIDER",
    sourceUrl: raw.sourceUrl.trim(),
    rawTitle: raw.rawTitle.trim(),
    rawDescription: raw.rawDescription?.trim(),
    suggestedCategory: resolveCategory(raw.rawCategory),
    suggestedDistrictId: district,
    suggestedVenueId,
    suggestedStartsAt,
    artist: raw.rawArtist?.trim(),
    fingerprint,
    evidence: raw.evidence,
    imageCandidates: [],
  };
}
