import { MEDIA } from "@/lib/data/media-urls";
import { getGenericFallback, isBrokenMediaUrl, isDistrictSceneryUrl } from "@/lib/ui/media-registry";
import type { DiscoveryVenue } from "@/types/event";

const VENUE_TYPE_PLACEHOLDER: Record<DiscoveryVenue["venueType"], string> = {
  outdoor: MEDIA.posters.festivalCrowd,
  culture: MEDIA.posters.art,
  arena: MEDIA.posters.concertDj,
  beach: MEDIA.posters.festivalCrowd,
};

export function getVenueImageSources(venue: DiscoveryVenue): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  const add = (url: string | undefined) => {
    if (!url || seen.has(url)) return;
    if (isDistrictSceneryUrl(url)) return;
    seen.add(url);
    chain.push(url);
  };

  add(venue.photo);
  add(VENUE_TYPE_PLACEHOLDER[venue.venueType]);
  add(getGenericFallback());

  return chain;
}

export function getVenueImage(venue: DiscoveryVenue): string {
  for (const url of getVenueImageSources(venue)) {
    if (!isBrokenMediaUrl(url) && !isDistrictSceneryUrl(url)) return url;
  }
  return VENUE_TYPE_PLACEHOLDER[venue.venueType];
}
