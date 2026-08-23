import { cache } from "react";

import {
  assertSupabaseDataSourceReady,
  isSupabaseDataSource,
} from "@/lib/supabase/config";
import { stripPublicLiveSalesSignals } from "@/lib/data/adapters/ticket-offer-mapper";
import {
  districtsRepository as mockDistrictsRepository,
  eventsRepository as mockEventsRepository,
  venuesRepository as mockVenuesRepository,
} from "@/lib/data/events";
import { getMockTicketOffers } from "@/lib/data/mock-ticket-offers";
import { supabaseDistrictsRepository } from "@/lib/data/supabase-districts";
import { supabaseEventsRepository } from "@/lib/data/supabase-events";
import { supabaseTicketOffersRepository } from "@/lib/data/supabase-ticket-offers";
import { supabaseVenuesRepository } from "@/lib/data/supabase-venues";
import { filterEvents } from "@/lib/discovery/filter-events";
import { findRelatedEvents } from "@/lib/discovery/related-events";
import { resolveSlug } from "@/lib/discovery/resolve-slug";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import type { SearchOptions } from "@/types/discovery";
import type {
  DiscoveryEvent,
  DiscoveryTicketOffer,
  DiscoveryVenue,
  DistrictInfo,
  DistrictSlug,
  EventCategory,
} from "@/types/event";

/**
 * One events fetch per request — shared across listing, category, venue pages.
 * Canonical facade for pages: `discoveryEventsRepository`.
 * Supabase mode: fail loud (no silent mock fallback). List pool = upcoming only.
 */
const loadDiscoveryEvents = cache(async (): Promise<DiscoveryEvent[]> => {
  if (isSupabaseDataSource()) {
    assertSupabaseDataSourceReady();
    return supabaseEventsRepository.getAll();
  }
  return mockEventsRepository.getAll();
});

const loadDiscoveryVenues = cache(async (): Promise<DiscoveryVenue[]> => {
  if (isSupabaseDataSource()) {
    assertSupabaseDataSourceReady();
    return supabaseVenuesRepository.getAll();
  }
  return mockVenuesRepository.getAll();
});

const loadDiscoveryDistricts = cache(async (): Promise<DistrictInfo[]> => {
  if (isSupabaseDataSource()) {
    assertSupabaseDataSourceReady();
    return supabaseDistrictsRepository.getAll();
  }
  return mockDistrictsRepository.getAll();
});

function findEventBySlug(events: DiscoveryEvent[], slug: string): DiscoveryEvent | undefined {
  return events.find((event) => event.slug === slug);
}

/**
 * Canonical public discovery facade for pages.
 * Supabase backend: `supabaseEventsRepository` (list = upcoming; detail = includes past).
 * Mock only when SUPABASE_DATA_SOURCE=mock is explicit in development.
 * Query errors and missing Supabase env never fall back to mock.
 */
export const discoveryEventsRepository = {
  /** Upcoming discovery pool — homepage, listings, search, category/district grids. */
  getAll: loadDiscoveryEvents,

  async getAllEventSlugs(): Promise<string[]> {
    const events = await loadDiscoveryEvents();
    return events.map((event) => event.slug);
  },

  getDistrictSlugs(): DistrictSlug[] {
    return [...DISTRICT_SLUGS];
  },

  /** Detail/deep-link resolution — may include past/completed events. */
  async resolveSlug(slug: string) {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseEventsRepository.resolveSlug(slug);
    }
    return resolveSlug(slug, (s) => findEventBySlug(mockEventsRepository.getAll(), s));
  },

  /** Detail pages — past events remain reachable by slug. */
  async getBySlug(slug: string): Promise<DiscoveryEvent | undefined> {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseEventsRepository.getBySlug(slug);
    }
    return findEventBySlug(mockEventsRepository.getAll(), slug);
  },

  async search(
    params: DiscoverySearchParams = {},
    options: SearchOptions = {}
  ): Promise<DiscoveryEvent[]> {
    const { limit, offset, sort } = options;
    const mergedParams: DiscoverySearchParams = {
      ...params,
      ...(sort !== undefined ? { sort } : {}),
    };

    const all = await loadDiscoveryEvents();
    let result = filterEvents(all, mergedParams);

    if (offset !== undefined && offset > 0) {
      result = result.slice(offset);
    }
    if (limit !== undefined && limit >= 0) {
      result = result.slice(0, limit);
    }

    return result;
  },

  async getToday(): Promise<DiscoveryEvent[]> {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseEventsRepository.getToday();
    }
    return mockEventsRepository.getToday();
  },

  async getPopularForHomepage(
    excludeIds: string[] = [],
    limit = 6
  ): Promise<DiscoveryEvent[]> {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseEventsRepository.getPopularForHomepage(excludeIds, limit);
    }
    return mockEventsRepository.getPopularForHomepage(excludeIds, limit);
  },

  async getUpcomingForHomepage(
    excludeIds: string[] = [],
    limit = 6
  ): Promise<DiscoveryEvent[]> {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseEventsRepository.getUpcomingForHomepage(excludeIds, limit);
    }
    return mockEventsRepository.getUpcomingForHomepage(excludeIds, limit);
  },

  async getByDistrict(district: DistrictSlug): Promise<DiscoveryEvent[]> {
    const all = await loadDiscoveryEvents();
    return all.filter((event) => event.district === district);
  },

  async getByCategory(category: EventCategory): Promise<DiscoveryEvent[]> {
    const all = await loadDiscoveryEvents();
    return all.filter((event) => event.category === category);
  },

  async getByVenueSlug(venueSlug: string): Promise<DiscoveryEvent[]> {
    const all = await loadDiscoveryEvents();
    return all.filter((event) => event.venueSlug === venueSlug);
  },

  async getRelatedEvents(event: DiscoveryEvent, limit = 4): Promise<DiscoveryEvent[]> {
    const all = await loadDiscoveryEvents();
    return findRelatedEvents(event, all, limit);
  },

  /** Public ticket catalog — remaining/sold/stock are stripped (no live sales). */
  async getTicketOffers(eventId: string): Promise<DiscoveryTicketOffer[]> {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return stripPublicLiveSalesSignals(
        await supabaseTicketOffersRepository.getByEventId(eventId)
      );
    }
    return stripPublicLiveSalesSignals(getMockTicketOffers(eventId));
  },
};

export const discoveryVenuesRepository = {
  getAll: loadDiscoveryVenues,

  async getBySlug(slug: string): Promise<DiscoveryVenue | undefined> {
    const venues = await loadDiscoveryVenues();
    return venues.find((venue) => venue.slug === slug);
  },

  async searchByName(q: string): Promise<DiscoveryVenue[]> {
    const needle = q.toLowerCase().trim();
    const venues = await loadDiscoveryVenues();
    if (!needle) return venues;
    return venues.filter(
      (venue) =>
        venue.name.toLowerCase().includes(needle) ||
        venue.slug.replace(/-/g, " ").includes(needle) ||
        venue.district.toLowerCase().includes(needle)
    );
  },
};

export const discoveryDistrictsRepository = {
  getAll: loadDiscoveryDistricts,

  async getBySlug(slug: DistrictSlug): Promise<DistrictInfo | undefined> {
    const districts = await loadDiscoveryDistricts();
    return districts.find((district) => district.slug === slug);
  },
};

export function computeCategoryEventCounts(
  events: DiscoveryEvent[],
  categories: EventCategory[]
): Record<EventCategory, number> {
  const counts = {} as Record<EventCategory, number>;
  for (const category of categories) {
    counts[category] = events.filter((event) => event.category === category).length;
  }
  return counts;
}
