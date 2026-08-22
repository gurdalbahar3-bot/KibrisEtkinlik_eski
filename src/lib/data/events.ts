import { DISTRICT_SLUGS } from "@/lib/data/categories";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { filterEvents, getDateRange } from "@/lib/discovery/filter-events";
import { findRelatedEvents } from "@/lib/discovery/related-events";
import { resolveSlug, validateEventSlug } from "@/lib/discovery/resolve-slug";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";
import { MOCK_DISTRICTS, MOCK_EVENTS, MOCK_VENUES } from "@/lib/data/mock-events";
import type { SearchOptions } from "@/types/discovery";
import type {
  DiscoveryEvent,
  DiscoveryVenue,
  DistrictInfo,
  DistrictSlug,
  EventCategory,
} from "@/types/event";

function findEventBySlug(slug: string): DiscoveryEvent | undefined {
  const event = MOCK_EVENTS.find((e) => e.slug === slug);
  return event ? withMockCoverFlags(event) : undefined;
}

/** Fail fast if mock data violates reserved district slug rules. */
for (const event of MOCK_EVENTS) {
  const validation = validateEventSlug(event.slug);
  if (!validation.valid) {
    throw new Error(
      `Invalid mock event slug "${event.slug}": conflicts with reserved district slug`
    );
  }
}

/** Mark catalog posters as real covers for local mock/UI lab (not Supabase placeholders). */
function withMockCoverFlags(event: DiscoveryEvent): DiscoveryEvent {
  const coverImageUrl = event.coverImageUrl ?? (event.poster?.trim() || undefined);
  return {
    ...event,
    coverImageUrl,
    hasRealCover: event.hasRealCover ?? Boolean(coverImageUrl),
  };
}

/** Repository facade — swap mock for Supabase without changing components. */
export const eventsRepository = {
  getAll(): DiscoveryEvent[] {
    return MOCK_EVENTS.map(withMockCoverFlags);
  },

  getAllEventSlugs(): string[] {
    return MOCK_EVENTS.map((e) => e.slug);
  },

  getDistrictSlugs(): DistrictSlug[] {
    return [...DISTRICT_SLUGS];
  },

  validateEventSlug(slug: string) {
    return validateEventSlug(slug);
  },

  resolveSlug(slug: string) {
    return resolveSlug(slug, findEventBySlug);
  },

  getBySlug(slug: string): DiscoveryEvent | undefined {
    return findEventBySlug(slug);
  },

  search(params: DiscoverySearchParams = {}, options: SearchOptions = {}): DiscoveryEvent[] {
    const { limit, offset, sort } = options;
    const mergedParams: DiscoverySearchParams = {
      ...params,
      ...(sort !== undefined ? { sort } : {}),
    };
    let result = filterEvents(MOCK_EVENTS, mergedParams);

    if (offset !== undefined && offset > 0) {
      result = result.slice(offset);
    }
    if (limit !== undefined && limit >= 0) {
      result = result.slice(0, limit);
    }

    return result;
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

  getRelatedEvents(event: DiscoveryEvent, limit = 4): DiscoveryEvent[] {
    return findRelatedEvents(event, MOCK_EVENTS, limit);
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
