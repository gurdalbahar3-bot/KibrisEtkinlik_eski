import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DiscoveryEvent, DistrictSlug } from "@/types/event";

export type SlugResolution =
  | { type: "event"; event: DiscoveryEvent }
  | { type: "district"; district: DistrictSlug }
  | { type: "not_found" };

export function isReservedDistrictSlug(slug: string): slug is DistrictSlug {
  return DISTRICT_SLUGS.includes(slug as DistrictSlug);
}

/** Event slugs must not collide with reserved district slugs. */
export function validateEventSlug(slug: string): { valid: true } | { valid: false; reason: "reserved_district_slug" } {
  if (isReservedDistrictSlug(slug)) {
    return { valid: false, reason: "reserved_district_slug" };
  }
  return { valid: true };
}

/**
 * Deterministic slug resolution — event wins over district.
 * 1. Event by slug → event detail
 * 2. Reserved district slug → district listing
 * 3. Otherwise → not found
 */
export function resolveSlug(
  slug: string,
  getEventBySlug: (slug: string) => DiscoveryEvent | undefined
): SlugResolution {
  const event = getEventBySlug(slug);
  if (event) {
    return { type: "event", event };
  }

  if (isReservedDistrictSlug(slug)) {
    return { type: "district", district: slug };
  }

  return { type: "not_found" };
}
