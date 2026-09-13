import { DISTRICT_SLUGS } from "@/lib/data/categories";
import {
  mapEventRowToDiscoveryEvent,
  mapEventRowsToDiscoveryEvents,
} from "@/lib/data/adapters/event-mapper";
import {
  DISCOVERY_LIST_STATUSES,
  EVENT_DISCOVERY_SELECT,
  PUBLIC_EVENT_STATUSES,
} from "@/lib/data/supabase/queries";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { filterEvents, getDateRange } from "@/lib/discovery/filter-events";
import { findRelatedEvents } from "@/lib/discovery/related-events";
import { resolveSlug, validateEventSlug } from "@/lib/discovery/resolve-slug";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import type { SearchOptions } from "@/types/discovery";
import type { DbEventRow } from "@/types/supabase/database";
import type { DiscoveryEvent, DistrictSlug, EventCategory } from "@/types/event";

/**
 * Homepage / listing / search pool: published|postponed, Cyprus date >= today.
 * Past and `completed` events are excluded here — use detail fetch for deep links.
 */
async function fetchDiscoveryListEventRows(): Promise<DbEventRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_DISCOVERY_SELECT)
    .in("status", [...DISCOVERY_LIST_STATUSES])
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Supabase discovery events fetch failed: ${error.message}`);
  }

  return (data ?? []) as unknown as DbEventRow[];
}

/** Detail / deep-link pool: includes past + completed (still RLS-public). */
async function fetchPublicDetailEventRows(): Promise<DbEventRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_DISCOVERY_SELECT)
    .in("status", [...PUBLIC_EVENT_STATUSES])
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Supabase event detail fetch failed: ${error.message}`);
  }

  return (data ?? []) as unknown as DbEventRow[];
}

function filterUpcomingCyprus(events: DiscoveryEvent[]): DiscoveryEvent[] {
  const today = getCyprusDateString();
  return events.filter((event) => event.date >= today);
}

async function fetchDiscoveryListEvents(): Promise<DiscoveryEvent[]> {
  const rows = await fetchDiscoveryListEventRows();
  return filterUpcomingCyprus(mapEventRowsToDiscoveryEvents(rows));
}

async function fetchPublicDetailEvents(): Promise<DiscoveryEvent[]> {
  const rows = await fetchPublicDetailEventRows();
  return mapEventRowsToDiscoveryEvents(rows);
}

function findEventBySlug(events: DiscoveryEvent[], slug: string): DiscoveryEvent | undefined {
  return events.find((event) => event.slug === slug);
}

/**
 * Supabase READ repository for public discovery.
 * Canonical page access goes through `discoveryEventsRepository` (this is the supabase backend).
 */
export const supabaseEventsRepository = {
  /** Upcoming discovery pool for homepage, listings, and search. */
  async getAll(): Promise<DiscoveryEvent[]> {
    return fetchDiscoveryListEvents();
  },

  /** Includes past/completed — for detail pages and slug resolution only. */
  async getAllForDetail(): Promise<DiscoveryEvent[]> {
    return fetchPublicDetailEvents();
  },

  async getAllEventSlugs(): Promise<string[]> {
    const events = await fetchDiscoveryListEvents();
    return events.map((event) => event.slug);
  },

  getDistrictSlugs(): DistrictSlug[] {
    return [...DISTRICT_SLUGS];
  },

  validateEventSlug(slug: string) {
    return validateEventSlug(slug);
  },

  async resolveSlug(slug: string) {
    const events = await fetchPublicDetailEvents();
    return resolveSlug(slug, (s) => findEventBySlug(events, s));
  },

  async getBySlug(slug: string): Promise<DiscoveryEvent | undefined> {
    const events = await fetchPublicDetailEvents();
    return findEventBySlug(events, slug);
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

    const all = await fetchDiscoveryListEvents();
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
    const { from, to } = getDateRange("today");
    const all = await fetchDiscoveryListEvents();
    return all.filter((event) => event.date >= from && event.date <= to);
  },

  async getPopular(): Promise<DiscoveryEvent[]> {
    const all = await fetchDiscoveryListEvents();
    return all.filter((event) => event.isPopular);
  },

  async getPopularForHomepage(
    excludeIds: string[] = [],
    limit = 6
  ): Promise<DiscoveryEvent[]> {
    const today = getCyprusDateString();
    const all = await fetchDiscoveryListEvents();
    return all
      .filter(
        (event) => event.isPopular && event.date > today && !excludeIds.includes(event.id)
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  async getUpcoming(limit = 8): Promise<DiscoveryEvent[]> {
    const today = getCyprusDateString();
    const all = await fetchDiscoveryListEvents();
    return all
      .filter((event) => event.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  async getUpcomingForHomepage(
    excludeIds: string[] = [],
    limit = 6
  ): Promise<DiscoveryEvent[]> {
    const today = getCyprusDateString();
    const all = await fetchDiscoveryListEvents();
    return all
      .filter((event) => event.date > today && !excludeIds.includes(event.id))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  async getByDistrict(district: DistrictSlug): Promise<DiscoveryEvent[]> {
    const all = await fetchDiscoveryListEvents();
    return all.filter((event) => event.district === district);
  },

  async getByCategory(category: EventCategory): Promise<DiscoveryEvent[]> {
    const all = await fetchDiscoveryListEvents();
    return all.filter((event) => event.category === category);
  },

  async getByVenueSlug(venueSlug: string): Promise<DiscoveryEvent[]> {
    const all = await fetchDiscoveryListEvents();
    return all.filter((event) => event.venueSlug === venueSlug);
  },

  async getRelatedEvents(event: DiscoveryEvent, limit = 4): Promise<DiscoveryEvent[]> {
    const all = await fetchDiscoveryListEvents();
    return findRelatedEvents(event, all, limit);
  },

  /** Direct row access for tests or advanced callers. */
  async getById(id: string): Promise<DiscoveryEvent | undefined> {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_DISCOVERY_SELECT)
      .eq("id", id)
      .in("status", [...PUBLIC_EVENT_STATUSES])
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase event fetch failed: ${error.message}`);
    }
    if (!data) return undefined;
    return mapEventRowToDiscoveryEvent(data as unknown as DbEventRow);
  },
};
