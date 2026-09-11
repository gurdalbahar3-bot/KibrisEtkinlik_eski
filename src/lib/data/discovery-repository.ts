import { cache } from "react";

import {
  assertSupabaseDataSourceReady,
  isSupabaseDataSource,
} from "@/lib/supabase/config";
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
import {
  applyCommerceIndex,
  loadDiscoveryCommerceIndex,
} from "@/lib/data/discovery-commerce";
import { paginateItems } from "@/lib/discovery/pagination";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import type { DiscoverySearchResult, SearchOptions } from "@/types/discovery";
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
  let events: DiscoveryEvent[];
  if (isSupabaseDataSource()) {
    assertSupabaseDataSourceReady();
    events = await supabaseEventsRepository.getAll();
  } else {
    events = mockEventsRepository.getAll();
  }
  const index = await loadDiscoveryCommerceIndex();
  return applyCommerceIndex(events, index);
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

function pageSizeOrDefault(limit?: number): number {
  return limit != null && limit > 0 ? limit : 24;
}

async function runDiscoverySearchPage(
  params: DiscoverySearchParams = {},
  options: SearchOptions = {}
): Promise<DiscoverySearchResult> {
  const { limit, offset, sort, page } = options;
  const mergedParams: DiscoverySearchParams = {
    ...params,
    ...(sort !== undefined ? { sort } : {}),
  };

  const all = await loadDiscoveryEvents();
  const filtered = filterEvents(all, mergedParams);

  const wantsPagination =
    page != null || params.page != null || (limit != null && offset != null);

  if (!wantsPagination && offset == null && limit == null) {
    return {
      items: filtered,
      total: filtered.length,
      page: 1,
      pageSize: filtered.length || 1,
      pageCount: 1,
    };
  }

  if (offset !== undefined || (limit !== undefined && page == null && params.page == null)) {
    let sliced = filtered;
    if (offset !== undefined && offset > 0) {
      sliced = sliced.slice(offset);
    }
    if (limit !== undefined && limit >= 0) {
      sliced = sliced.slice(0, limit);
    }
    return {
      items: sliced,
      total: filtered.length,
      page: 1,
      pageSize: sliced.length || limit || filtered.length,
      pageCount: 1,
    };
  }

  const currentPage = page ?? params.page ?? 1;
  return paginateItems(filtered, currentPage, pageSizeOrDefault(limit));
}

/**
 * Canonical public discovery facade for pages.
 * Supabase backend: `supabaseEventsRepository` (list = upcoming; detail = includes past).
 * Mock only in development/test when SUPABASE_DATA_SOURCE is unset or mock.
 * Production never uses mock — getDataSource() fails loud.
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
    let event: DiscoveryEvent | undefined;
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      event = await supabaseEventsRepository.getBySlug(slug);
    } else {
      event = findEventBySlug(mockEventsRepository.getAll(), slug);
    }
    if (!event) return undefined;
    const index = await loadDiscoveryCommerceIndex();
    return applyCommerceIndex([event], index)[0];
  },

  /** Checkout deep-link — public statuses only (same as getById on supabase). */
  async getById(id: string): Promise<DiscoveryEvent | undefined> {
    let event: DiscoveryEvent | undefined;
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      event = await supabaseEventsRepository.getById(id);
    } else {
      event = mockEventsRepository.getAll().find((row) => row.id === id);
    }
    if (!event) return undefined;
    const index = await loadDiscoveryCommerceIndex();
    return applyCommerceIndex([event], index)[0];
  },

  async search(
    params: DiscoverySearchParams = {},
    options: SearchOptions = {}
  ): Promise<DiscoveryEvent[]> {
    const page = await runDiscoverySearchPage(params, options);
    return page.items;
  },

  /**
   * Server-side filtered + paginated discovery search.
   * Filtering runs on the public upcoming pool (already status-gated).
   */
  async searchPage(
    params: DiscoverySearchParams = {},
    options: SearchOptions = {}
  ): Promise<DiscoverySearchResult> {
    return runDiscoverySearchPage(params, options);
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

  /** Public ticket catalog for an event — empty when unpublished or no types. */
  async getTicketOffers(eventId: string): Promise<DiscoveryTicketOffer[]> {
    if (isSupabaseDataSource()) {
      assertSupabaseDataSourceReady();
      return supabaseTicketOffersRepository.getByEventId(eventId);
    }
    return getMockTicketOffers(eventId);
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
