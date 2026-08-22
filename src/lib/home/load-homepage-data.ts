import { HOMEPAGE_CURATED_CATEGORIES } from "@/lib/data/categories";
import {
  computeCategoryEventCounts,
  discoveryDistrictsRepository,
  discoveryEventsRepository,
  discoveryVenuesRepository,
} from "@/lib/data/discovery-repository";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { getDateRange } from "@/lib/discovery/filter-events";
import type {
  DiscoveryEvent,
  DiscoveryVenue,
  DistrictInfo,
  EventCategory,
} from "@/types/event";

const FEATURED_VENUE_LIMIT = 4;
const FEATURED_LIMIT = 4;
const SECTION_LIMIT = 6;

export interface HomepageDiscoveryData {
  heroEvent: DiscoveryEvent | null;
  featuredEvents: DiscoveryEvent[];
  todayPreview: DiscoveryEvent[];
  weekendPreview: DiscoveryEvent[];
  upcomingPreview: DiscoveryEvent[];
  venues: DiscoveryVenue[];
  districts: DistrictInfo[];
  categoryCounts: Record<EventCategory, number>;
  stats: {
    totalEvents: number;
    todayCount: number;
    weekendCount: number;
    venueCount: number;
    districtCount: number;
  };
}

/** Featured/hero covers: real `cover_image_url` only — never UI placeholders. */
function hasRealCover(event: DiscoveryEvent): boolean {
  if (typeof event.hasRealCover === "boolean") return event.hasRealCover;
  return Boolean(event.coverImageUrl?.trim());
}

function sortByDateThenTime(a: DiscoveryEvent, b: DiscoveryEvent): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

/**
 * Single-pass homepage loader.
 * Dedup: hero → featured → today → weekend → upcoming.
 */
export async function loadHomepageDiscoveryData(): Promise<HomepageDiscoveryData> {
  const [allEvents, allVenues, allDistricts] = await Promise.all([
    discoveryEventsRepository.getAll(),
    discoveryVenuesRepository.getAll(),
    discoveryDistrictsRepository.getAll(),
  ]);

  const todayRange = getDateRange("today");
  const weekendRange = getDateRange("weekend");
  const today = getCyprusDateString();

  const todayEvents = allEvents
    .filter((event) => event.date >= todayRange.from && event.date <= todayRange.to)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const weekendEvents = allEvents
    .filter((event) => event.date >= weekendRange.from && event.date <= weekendRange.to)
    .sort(sortByDateThenTime);

  const withCover = allEvents.filter(hasRealCover).sort(sortByDateThenTime);
  const popularWithCover = withCover.filter((event) => event.isPopular);

  const heroEvent =
    popularWithCover.find((e) => e.date >= today) ??
    withCover.find((e) => e.date >= today) ??
    todayEvents.find(hasRealCover) ??
    todayEvents[0] ??
    null;

  const usedIds = new Set<string>(heroEvent ? [heroEvent.id] : []);

  const featuredPool = [
    ...popularWithCover.filter((e) => !usedIds.has(e.id) && e.date >= today),
    ...withCover.filter((e) => !usedIds.has(e.id) && e.date >= today && !e.isPopular),
  ];
  const featuredEvents = featuredPool.slice(0, FEATURED_LIMIT);
  featuredEvents.forEach((event) => usedIds.add(event.id));

  const todayPreview = todayEvents.filter((event) => !usedIds.has(event.id)).slice(0, SECTION_LIMIT);
  todayPreview.forEach((event) => usedIds.add(event.id));

  const weekendPreview = weekendEvents
    .filter((event) => !usedIds.has(event.id))
    .slice(0, SECTION_LIMIT);
  weekendPreview.forEach((event) => usedIds.add(event.id));

  const upcomingPreview = allEvents
    .filter((event) => event.date > today && !usedIds.has(event.id))
    .sort(sortByDateThenTime)
    .slice(0, SECTION_LIMIT);

  const venues = [...allVenues]
    .sort((a, b) => b.upcomingEventCount - a.upcomingEventCount)
    .slice(0, FEATURED_VENUE_LIMIT);

  const categoryCounts = computeCategoryEventCounts(allEvents, HOMEPAGE_CURATED_CATEGORIES);

  return {
    heroEvent,
    featuredEvents,
    todayPreview,
    weekendPreview,
    upcomingPreview,
    venues,
    districts: allDistricts,
    categoryCounts,
    stats: {
      totalEvents: allEvents.length,
      todayCount: todayEvents.length,
      weekendCount: weekendEvents.length,
      venueCount: allVenues.length,
      districtCount: allDistricts.length,
    },
  };
}
