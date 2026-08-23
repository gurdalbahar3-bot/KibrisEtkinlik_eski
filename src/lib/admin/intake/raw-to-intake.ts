import { createIntakeFingerprint } from "@/lib/admin/intake/fingerprint";
import { resolveSpiderDistrict } from "@/lib/admin/intake/district";
import { normalizeCategorySlug, normalizeVenueName } from "@/lib/admin/intake/normalize";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import type { CreateIntakeInput } from "@/types/admin/intake";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";
import type { EventCategory } from "@/types/event";

export { resolveSpiderDistrict } from "@/lib/admin/intake/district";

export function resolveSpiderCategory(rawCategory?: string): EventCategory | undefined {
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

  const district = resolveSpiderDistrict(raw.rawDistrict);
  const suggestedStartsAt = combineDateTime(raw.rawDate, raw.rawTime);
  const suggestedVenueId = slugifyVenue(raw.rawVenue);

  const fingerprint = createIntakeFingerprint({
    title: raw.rawTitle,
    district,
  });

  return {
    status: "DISCOVERED",
    source: "SPIDER",
    sourceUrl: raw.sourceUrl.trim(),
    rawTitle: raw.rawTitle.trim(),
    rawDescription: raw.rawDescription?.trim(),
    suggestedCategory: resolveSpiderCategory(raw.rawCategory),
    suggestedDistrictId: district,
    suggestedVenueId,
    suggestedStartsAt,
    artist: raw.rawArtist?.trim(),
    fingerprint,
    evidence: raw.evidence,
    imageCandidates: [],
  };
}
