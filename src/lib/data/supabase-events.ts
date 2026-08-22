import { DISTRICT_SLUGS } from "@/lib/data/categories";
import {
  mapEventRowToDiscoveryEvent,
  mapEventRowsToDiscoveryEvents,
} from "@/lib/data/adapters/event-mapper";
import { EVENT_DISCOVERY_SELECT, PUBLIC_EVENT_STATUSES } from "@/lib/data/supabase/queries";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { filterEvents, getDateRange } from "@/lib/discovery/filter-events";
import { findRelatedEvents } from "@/lib/discovery/related-events";
import { resolveSlug, validateEventSlug } from "@/lib/discovery/resolve-slug";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import type { SearchOptions } from "@/types/discovery";
import type { DbEventRow } from "@/types/supabase/database";
import type { DiscoveryEvent, DistrictSlug, EventCategory } from "@/types/event";

async function fetchPublishedEventRows(): Promise<DbEventRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_DISCOVERY_SELECT)
    .in("status", [...PUBLIC_EVENT_STATUSES])
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Supabase events fetch failed: ${error.message}`);
  }

  return (data ?? []) as DbEventRow[];
}

async function fetchAllDiscoveryEvents(): Promise<DiscoveryEvent[]> {
  const rows = await fetchPublishedEventRows();
  return mapEventRowsToDiscoveryEvents(rows);
}

function findEventBySlug(events: DiscoveryEvent[], slug: string): DiscoveryEvent | undefined {
  return events.find((event) => event.slug === slug);
}

/**
 * Async Supabase READ repository — parallel to mock `eventsRepository`.
 * Not wired into pages yet; enable via SUPABASE_DATA_SOURCE=supabase in a later phase.
 */
export const supabaseEventsRepository = {
  async getAll(): Promise<DiscoveryEvent[]> {
    return fetchAllDiscoveryEvents();
  },

  async getAllEventSlugs(): Promise<string[]> {
    const events = await fetchAllDiscoveryEvents();
    return events.map((event) => event.slug);
  },

  getDistrictSlugs(): DistrictSlug[] {
    return [...DISTRICT_SLUGS];
  },

  validateEventSlug(slug: string) {
    return validateEventSlug(slug);
  },

  async resolveSlug(slug: string) {
    const events = await fetchAllDiscoveryEvents();
    return resolveSlug(slug, (s) => findEventBySlug(events, s));
  },

  async getBySlug(slug: string): Promise<DiscoveryEvent | undefined> {
    const events = await fetchAllDiscoveryEvents();
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

    const all = await fetchAllDiscoveryEvents();
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
    const all = await fetchAllDiscoveryEvents();
    return all.filter((event) => event.date >= from && event.date <= to);
  },

  async getPopular(): Promise<DiscoveryEvent[]> {
    const all = await fetchAllDiscoveryEvents();
    return all.filter((event) => event.isPopular);
  },

  async getPopularForHomepage(
    excludeIds: string[] = [],
    limit = 6
  ): Promise<DiscoveryEvent[]> {
    const today = getCyprusDateString();
    const all = await fetchAllDiscoveryEvents();
    return all
      .filter(
        (event) => event.isPopular && event.date > today && !excludeIds.includes(event.id)
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  async getUpcoming(limit = 8): Promise<DiscoveryEvent[]> {
    const today = getCyprusDateString();
    const all = await fetchAllDiscoveryEvents();
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
    const all = await fetchAllDiscoveryEvents();
    return all
      .filter((event) => event.date > today && !excludeIds.includes(event.id))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  },

  async getByDistrict(district: DistrictSlug): Promise<DiscoveryEvent[]> {
    const all = await fetchAllDiscoveryEvents();
    return all.filter((event) => event.district === district);
  },

  async getByCategory(category: EventCategory): Promise<DiscoveryEvent[]> {
    const all = await fetchAllDiscoveryEvents();
    return all.filter((event) => event.category === category);
  },

  async getByVenueSlug(venueSlug: string): Promise<DiscoveryEvent[]> {
    const all = await fetchAllDiscoveryEvents();
    return all.filter((event) => event.venueSlug === venueSlug);
  },

  async getRelatedEvents(event: DiscoveryEvent, limit = 4): Promise<DiscoveryEvent[]> {
    const all = await fetchAllDiscoveryEvents();
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
    return mapEventRowToDiscoveryEvent(data as DbEventRow);
  },
};
