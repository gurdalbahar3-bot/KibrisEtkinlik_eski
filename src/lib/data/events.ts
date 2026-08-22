import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import {
  queryAllEvents,
  queryDistricts,
  queryEventBySlug,
  queryEventsByCategory,
  queryEventsByDistrict,
  queryEventsByVenueSlug,
  queryEventsSearch,
  queryFeaturedEvents,
  queryTodayEvents,
  queryUpcomingEvents,
  queryVenueBySlug,
  queryVenues,
  queryWeekendEvents,
} from "@/lib/supabase/queries/discovery";
import type {
  DiscoveryEvent,
  DiscoveryVenue,
  DistrictInfo,
  DistrictSlug,
  EventCategory,
} from "@/types/event";

/** Async repository — reads published events from Supabase when configured. */
export const eventsRepository = {
  async getAll(): Promise<DiscoveryEvent[]> {
    return queryAllEvents();
  },

  async getBySlug(slug: string): Promise<DiscoveryEvent | undefined> {
    return queryEventBySlug(slug);
  },

  async search(params: DiscoverySearchParams = {}): Promise<DiscoveryEvent[]> {
    return queryEventsSearch(params);
  },

  async getToday(): Promise<DiscoveryEvent[]> {
    return queryTodayEvents();
  },

  async getWeekend(): Promise<DiscoveryEvent[]> {
    return queryWeekendEvents();
  },

  async getFeaturedForHomepage(excludeIds: string[] = [], limit = 6): Promise<DiscoveryEvent[]> {
    return queryFeaturedEvents(excludeIds, limit);
  },

  async getUpcomingForHomepage(excludeIds: string[] = [], limit = 6): Promise<DiscoveryEvent[]> {
    return queryUpcomingEvents(excludeIds, limit);
  },

  async getByDistrict(district: DistrictSlug): Promise<DiscoveryEvent[]> {
    return queryEventsByDistrict(district);
  },

  async getByCategory(category: EventCategory): Promise<DiscoveryEvent[]> {
    return queryEventsByCategory(category);
  },

  async getByVenueSlug(venueSlug: string): Promise<DiscoveryEvent[]> {
    return queryEventsByVenueSlug(venueSlug);
  },
};

export const venuesRepository = {
  async getAll(): Promise<DiscoveryVenue[]> {
    return queryVenues();
  },

  async getBySlug(slug: string): Promise<DiscoveryVenue | undefined> {
    return queryVenueBySlug(slug);
  },
};

export const districtsRepository = {
  async getAll(): Promise<DistrictInfo[]> {
    return queryDistricts();
  },

  async getBySlug(slug: DistrictSlug): Promise<DistrictInfo | undefined> {
    const districts = await queryDistricts();
    return districts.find((d) => d.slug === slug);
  },
};
