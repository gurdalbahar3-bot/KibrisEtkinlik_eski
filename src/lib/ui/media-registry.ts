import { MEDIA } from "@/lib/data/media-urls";
import type { DistrictSlug } from "@/types/event";

/**
 * Unsplash photo IDs confirmed 404 via Next.js image optimizer.
 * Used at runtime to skip known-dead URLs even if still referenced somewhere.
 */
export const BROKEN_PHOTO_IDS = [
  "photo-1459747526533-893ba0e338ca",
  "photo-1415201364774-47f7d36fbf00",
  "photo-1574391884720-bbc3740c8316",
  "photo-1506157783521-7a7b8f258397",
  "photo-1585699321531-68111469b2cf",
  "photo-1503090546910-440f8313fe8f",
  "photo-1429966719638-9aa9847541f4",
  "photo-1452626212852-811d58933fd5",
  "photo-1516450360562-960f9a8b0a8c",
] as const;

export function isBrokenMediaUrl(url: string): boolean {
  return BROKEN_PHOTO_IDS.some((id) => url.includes(id));
}

/** District scenery URLs — must never appear on event cards as posters. */
export function buildDistrictSceneryMap(): Map<string, DistrictSlug> {
  const map = new Map<string, DistrictSlug>();
  for (const [slug, url] of Object.entries(MEDIA.districts)) {
    map.set(url, slug as DistrictSlug);
  }
  return map;
}

export function isDistrictSceneryUrl(
  url: string,
  districtScenery: Map<string, DistrictSlug> = buildDistrictSceneryMap()
): boolean {
  return districtScenery.has(url);
}

export function getDistrictImage(district: DistrictSlug): string {
  return MEDIA.districts[district];
}

/** Generic poster URLs — category placeholders, not location scenery. */
export const GENERIC_POSTER_URLS = [
  MEDIA.posters.concertSunset,
  MEDIA.posters.festivalCrowd,
  MEDIA.posters.concertDj,
  MEDIA.posters.family,
  MEDIA.posters.art,
] as const;

export function getGenericFallback(): string {
  for (const url of GENERIC_POSTER_URLS) {
    if (!isBrokenMediaUrl(url)) return url;
  }
  return MEDIA.posters.concertSunset;
}

/** @deprecated Use buildDistrictSceneryMap — district photos are not event posters. */
export function buildUrlDistrictMap(): Map<string, DistrictSlug> {
  return buildDistrictSceneryMap();
}

/** @deprecated District scenery must not be used as cross-district event fallback. */
export function isDistrictSafeForEvent(
  url: string,
  _district: DistrictSlug,
  districtScenery: Map<string, DistrictSlug> = buildDistrictSceneryMap()
): boolean {
  return !districtScenery.has(url);
}
