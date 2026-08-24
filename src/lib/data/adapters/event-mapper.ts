import { CATEGORY_KEYS } from "@/lib/data/categories";
import { buildDeterministicSlug, buildVenueSlug } from "@/lib/data/adapters/slug";
import { resolveEventDistrict } from "@/lib/data/adapters/district-resolve";
import { formatCyprusDateFromIso, CYPRUS_TIMEZONE } from "@/lib/discovery/cyprus-date";
import { getEventImage } from "@/lib/ui/event-image";
import type { DbEventRow } from "@/types/supabase/database";
import type { DiscoveryEvent, EventCategory } from "@/types/event";

const CATEGORY_ALIASES: Record<string, EventCategory> = {
  concert: "concert",
  concerts: "concert",
  music: "concert",
  festival: "festival",
  festivals: "festival",
  theater: "theater",
  theatre: "theater",
  tiyatro: "theater",
  standup: "standup",
  "stand-up": "standup",
  comedy: "standup",
  nightlife: "nightlife",
  party: "nightlife",
  club: "nightlife",
  sports: "sports",
  sport: "sports",
  family: "family",
  kids: "family",
  children: "family",
  "art-culture": "art-culture",
  art: "art-culture",
  culture: "art-culture",
  wedding: "wedding",
  weddings: "wedding",
  other: "other",
};

export function normalizeEventCategory(raw: string | null | undefined): EventCategory {
  if (!raw?.trim()) return "other";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  if (CATEGORY_KEYS.includes(key as EventCategory)) return key as EventCategory;
  return "other";
}

function formatCyprusTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CYPRUS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function resolveSortedArtistNames(row: DbEventRow): string[] {
  const artists = row.event_artists ?? [];
  if (artists.length === 0) return [];

  return [...artists]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((link) => link.artists?.name?.trim())
    .filter((name): name is string => Boolean(name));
}

export function mapEventRowToDiscoveryEvent(row: DbEventRow): DiscoveryEvent {
  const venue = row.venues;
  const venueName = venue?.name?.trim() ?? "Venue TBD";
  const venueId = venue?.id ?? row.venue_id;
  const district = resolveEventDistrict(venue, row.event_locations);

  const coverImageUrl = row.cover_image_url?.trim() || undefined;
  const hasRealCover = Boolean(coverImageUrl);
  const artistNames = resolveSortedArtistNames(row);

  const draft: DiscoveryEvent = {
    id: row.id,
    title: row.title.trim(),
    slug: buildDeterministicSlug(row.title, row.id),
    poster: coverImageUrl ?? "",
    coverImageUrl,
    hasRealCover,
    date: formatCyprusDateFromIso(row.starts_at),
    startTime: formatCyprusTime(row.starts_at),
    venue: venueName,
    venueSlug: buildVenueSlug(venueName, venueId),
    district,
    category: normalizeEventCategory(row.category),
    description: row.description?.trim() ?? "",
    isFree: row.is_free,
    artist: artistNames[0],
    artists: artistNames.length > 0 ? artistNames : undefined,
    officialTicketUrl: row.official_ticket_url?.trim() || undefined,
  };

  // Display-only placeholder — must never set hasRealCover / coverImageUrl.
  if (!draft.poster) {
    draft.poster = getEventImage(draft);
  }

  return draft;
}

export function mapEventRowsToDiscoveryEvents(rows: DbEventRow[]): DiscoveryEvent[] {
  return rows.map(mapEventRowToDiscoveryEvent);
}
