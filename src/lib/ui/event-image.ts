import { MEDIA } from "@/lib/data/media-urls";
import {
  buildDistrictSceneryMap,
  getGenericFallback,
  isBrokenMediaUrl,
  isDistrictSceneryUrl,
} from "@/lib/ui/media-registry";
import type { DiscoveryEvent, EventCategory } from "@/types/event";

const DISTRICT_SCENERY = buildDistrictSceneryMap();

const CATEGORY_POSTER: Record<EventCategory, string> = {
  concert: MEDIA.posters.concertSunset,
  festival: MEDIA.posters.festivalCrowd,
  theater: MEDIA.posters.theater,
  standup: MEDIA.posters.standup,
  nightlife: MEDIA.posters.nightlife,
  sports: MEDIA.posters.sports,
  family: MEDIA.posters.family,
  "art-culture": MEDIA.posters.art,
  wedding: MEDIA.posters.concertSunset,
  other: MEDIA.posters.concertSunset,
};

function getCategoryFallback(category: EventCategory): string {
  const candidate = CATEGORY_POSTER[category];
  if (!isBrokenMediaUrl(candidate) && !isDistrictSceneryUrl(candidate, DISTRICT_SCENERY)) {
    return candidate;
  }

  for (const url of Object.values(CATEGORY_POSTER)) {
    if (!isBrokenMediaUrl(url) && !isDistrictSceneryUrl(url, DISTRICT_SCENERY)) {
      return url;
    }
  }

  return getGenericFallback();
}

function isValidEventPoster(url: string): boolean {
  return !isBrokenMediaUrl(url) && !isDistrictSceneryUrl(url, DISTRICT_SCENERY);
}

/**
 * Event image chain — V5.2: no district/city scenery as event posters.
 * Order: event poster → category placeholder → generic placeholder.
 */
export function getEventImageSources(event: DiscoveryEvent): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  const add = (url: string | undefined) => {
    if (!url || seen.has(url)) return;
    if (isDistrictSceneryUrl(url, DISTRICT_SCENERY)) return;
    seen.add(url);
    chain.push(url);
  };

  if (event.poster) add(event.poster);
  add(getCategoryFallback(event.category));
  add(getGenericFallback());

  return chain;
}

/** Primary display URL — first valid non-scenery source in the chain. */
export function getEventImage(event: DiscoveryEvent): string {
  for (const url of getEventImageSources(event)) {
    if (isValidEventPoster(url)) return url;
  }
  return getCategoryFallback(event.category);
}

export const __testing = {
  DISTRICT_SCENERY,
  getCategoryFallback,
  isDistrictSceneryUrl,
  isBrokenMediaUrl,
  isValidEventPoster,
  CATEGORY_POSTER,
};
