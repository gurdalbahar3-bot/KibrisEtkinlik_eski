import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { filterEvents, getDateRange } from "@/lib/discovery/filter-events";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import { MOCK_DISTRICTS, MOCK_EVENTS, MOCK_VENUES } from "@/lib/data/mock-events";
import type {
  DiscoveryEvent,
  DiscoveryVenue,
  DistrictInfo,
  DistrictSlug,
  EventCategory,
} from "@/types/event";

/** Repository facade — swap mock for Supabase without changing components. */
export const eventsRepository = {
  getAll(): DiscoveryEvent[] {
    return MOCK_EVENTS;
  },

  getBySlug(slug: string): DiscoveryEvent | undefined {
    return MOCK_EVENTS.find((e) => e.slug === slug);
  },

  search(params: DiscoverySearchParams = {}): DiscoveryEvent[] {
    return filterEvents(MOCK_EVENTS, params);
  },

  getToday(): DiscoveryEvent[] {
    const { from, to } = getDateRange("today");
    return MOCK_EVENTS.filter((e) => e.date >= from && e.date <= to);
  },

  getPopular(): DiscoveryEvent[] {
    return MOCK_EVENTS.filter((e) => e.isPopular);
  },

  /** Homepage: featured popular events excluding today's lineup. */
  getPopularForHomepage(excludeIds: string[] = [], limit = 6): DiscoveryEvent[] {
    const today = getCyprusDateString();
    return MOCK_EVENTS.filter(
      (e) => e.isPopular && e.date > today && !excludeIds.includes(e.id)
    )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  getUpcoming(limit = 8): DiscoveryEvent[] {
    const today = getCyprusDateString();
    return MOCK_EVENTS.filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  /** Homepage: other upcoming events — excludes today + popular picks. */
  getUpcomingForHomepage(excludeIds: string[] = [], limit = 6): DiscoveryEvent[] {
    const today = getCyprusDateString();
    return MOCK_EVENTS.filter(
      (e) => e.date > today && !excludeIds.includes(e.id)
    )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  getByDistrict(district: DistrictSlug): DiscoveryEvent[] {
    return MOCK_EVENTS.filter((e) => e.district === district);
  },

  getByCategory(category: EventCategory): DiscoveryEvent[] {
    return MOCK_EVENTS.filter((e) => e.category === category);
  },

  getByVenueSlug(venueSlug: string): DiscoveryEvent[] {
    return MOCK_EVENTS.filter((e) => e.venueSlug === venueSlug);
  },
};

export const venuesRepository = {
  getAll(): DiscoveryVenue[] {
    return MOCK_VENUES;
  },

  getBySlug(slug: string): DiscoveryVenue | undefined {
    return MOCK_VENUES.find((v) => v.slug === slug);
  },
};

export const districtsRepository = {
  getAll(): DistrictInfo[] {
    return MOCK_DISTRICTS;
  },

  getBySlug(slug: DistrictSlug): DistrictInfo | undefined {
    return MOCK_DISTRICTS.find((d) => d.slug === slug);
  },
};
