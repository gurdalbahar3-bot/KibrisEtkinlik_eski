import { DISTRICT_SLUGS } from "@/lib/data/categories";
import {
  mapDbEvent,
  mapDbVenue,
  mapDistrict,
  PUBLISHED_STATUSES,
} from "@/lib/data/map-discovery";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { getDateRange } from "@/lib/discovery/filter-events";
import { filterEvents } from "@/lib/discovery/filter-events";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  DiscoveryEvent,
  DiscoveryVenue,
  DistrictInfo,
  DistrictSlug,
  EventCategory,
} from "@/types/event";

const EVENT_SELECT = `
  id,
  title,
  description,
  category,
  is_free,
  starts_at,
  cover_image_url,
  venue:venues!inner (
    id,
    name,
    venue_category,
    district_id,
    kktc_districts ( code )
  ),
  event_locations (
    district_id,
    kktc_districts ( code )
  )
`;

async function fetchPublishedEvents(fromDate?: string): Promise<DiscoveryEvent[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createServerClient();
  let query = supabase
    .from("events")
    .select(EVENT_SELECT)
    .in("status", PUBLISHED_STATUSES)
    .order("starts_at", { ascending: true });

  if (fromDate) {
    query = query.gte("starts_at", `${fromDate}T00:00:00+00:00`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[discovery] fetchPublishedEvents:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapDbEvent(normalizeEventRow(row)));
}

function normalizeEventRow(row: Record<string, unknown>): Parameters<typeof mapDbEvent>[0] {
  const venueRaw = row.venue;
  const venue = Array.isArray(venueRaw) ? venueRaw[0] : venueRaw;
  const locationRaw = row.event_locations;
  const location = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw;

  const normalizeDistrict = (parent: Record<string, unknown> | null | undefined) => {
    if (!parent) return null;
    const distRaw = parent.kktc_districts;
    const dist = Array.isArray(distRaw) ? distRaw[0] : distRaw;
    return dist as { code: string } | null;
  };

  const venueObj = venue as Record<string, unknown> | null | undefined;
  const locationObj = location as Record<string, unknown> | null | undefined;

  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    category: row.category as string,
    is_free: row.is_free as boolean,
    starts_at: row.starts_at as string,
    cover_image_url: row.cover_image_url as string | null,
    venue: venueObj
      ? {
          id: venueObj.id as string,
          name: venueObj.name as string,
          venue_category: venueObj.venue_category as string | null,
          district_id: venueObj.district_id as string | null,
          kktc_districts: normalizeDistrict(venueObj),
        }
      : null,
    event_locations: locationObj
      ? {
          district_id: locationObj.district_id as string | null,
          kktc_districts: normalizeDistrict(locationObj),
        }
      : null,
  };
}

export async function queryAllEvents(): Promise<DiscoveryEvent[]> {
  const today = getCyprusDateString();
  return fetchPublishedEvents(today);
}

export async function queryEventBySlug(slug: string): Promise<DiscoveryEvent | undefined> {
  const events = await queryAllEvents();
  return events.find((e) => e.slug === slug);
}

export async function queryEventsSearch(
  params: DiscoverySearchParams = {}
): Promise<DiscoveryEvent[]> {
  const events = await queryAllEvents();
  return filterEvents(events, params);
}

export async function queryTodayEvents(): Promise<DiscoveryEvent[]> {
  const { from, to } = getDateRange("today");
  const events = await queryAllEvents();
  return events
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export async function queryWeekendEvents(): Promise<DiscoveryEvent[]> {
  const { from, to } = getDateRange("weekend");
  const events = await queryAllEvents();
  return events
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export async function queryFeaturedEvents(
  excludeIds: string[] = [],
  limit = 6
): Promise<DiscoveryEvent[]> {
  const today = getCyprusDateString();
  const events = await queryAllEvents();
  return events
    .filter((e) => e.date > today && !excludeIds.includes(e.id))
    .sort((a, b) => {
      const aHasPoster = a.poster.includes("unsplash") ? 0 : 1;
      const bHasPoster = b.poster.includes("unsplash") ? 0 : 1;
      if (aHasPoster !== bHasPoster) return bHasPoster - aHasPoster;
      return a.date.localeCompare(b.date);
    })
    .slice(0, limit);
}

export async function queryUpcomingEvents(
  excludeIds: string[] = [],
  limit = 6
): Promise<DiscoveryEvent[]> {
  const today = getCyprusDateString();
  const events = await queryAllEvents();
  return events
    .filter((e) => e.date > today && !excludeIds.includes(e.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, limit);
}

export async function queryEventsByDistrict(district: DistrictSlug): Promise<DiscoveryEvent[]> {
  const events = await queryAllEvents();
  return events.filter((e) => e.district === district);
}

export async function queryEventsByCategory(category: EventCategory): Promise<DiscoveryEvent[]> {
  const events = await queryAllEvents();
  return events.filter((e) => e.category === category);
}

export async function queryEventsByVenueSlug(venueSlug: string): Promise<DiscoveryEvent[]> {
  const events = await queryAllEvents();
  return events.filter((e) => e.venueSlug === venueSlug);
}

export async function queryVenues(limit = 8): Promise<DiscoveryVenue[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createServerClient();
  const today = getCyprusDateString();

  const { data: venues, error } = await supabase
    .from("venues")
    .select(
      `
      id,
      name,
      venue_category,
      floor_plan_url,
      kktc_districts ( code )
    `
    )
    .eq("status", "active")
    .limit(limit * 2);

  if (error || !venues?.length) {
    if (error) console.error("[discovery] queryVenues:", error.message);
    return [];
  }

  const { data: eventCounts } = await supabase
    .from("events")
    .select("venue_id")
    .in("status", PUBLISHED_STATUSES)
    .gte("starts_at", `${today}T00:00:00+00:00`);

  const countMap = new Map<string, number>();
  for (const row of eventCounts ?? []) {
    countMap.set(row.venue_id, (countMap.get(row.venue_id) ?? 0) + 1);
  }

  return venues
    .map((v) => {
      const row = v as Record<string, unknown>;
      const distRaw = row.kktc_districts;
      const dist = Array.isArray(distRaw) ? distRaw[0] : distRaw;
      return mapDbVenue({
        id: row.id as string,
        name: row.name as string,
        venue_category: row.venue_category as string | null,
        floor_plan_url: row.floor_plan_url as string | null,
        kktc_districts: dist as { code: string } | null,
        upcoming_count: countMap.get(row.id as string) ?? 0,
      });
    })
    .sort((a, b) => b.upcomingEventCount - a.upcomingEventCount)
    .slice(0, limit);
}

export async function queryVenueBySlug(slug: string): Promise<DiscoveryVenue | undefined> {
  const venues = await queryVenues(50);
  return venues.find((v) => v.slug === slug);
}

export async function queryDistricts(): Promise<DistrictInfo[]> {
  if (!isSupabaseConfigured()) {
    return DISTRICT_SLUGS.map((slug) => mapDistrict(slug, 0));
  }

  const events = await queryAllEvents();
  const counts = new Map<DistrictSlug, number>();

  for (const slug of DISTRICT_SLUGS) {
    counts.set(slug, 0);
  }
  for (const event of events) {
    counts.set(event.district, (counts.get(event.district) ?? 0) + 1);
  }

  return DISTRICT_SLUGS.map((slug) => mapDistrict(slug, counts.get(slug) ?? 0));
}

export async function queryEventSlugs(): Promise<string[]> {
  const events = await queryAllEvents();
  return events.map((e) => e.slug);
}

export async function queryVenueSlugs(): Promise<string[]> {
  const venues = await queryVenues(50);
  return venues.map((v) => v.slug);
}
