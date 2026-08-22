import { buildVenueSlug } from "@/lib/data/adapters/slug";
import { resolveVenueDistrict } from "@/lib/data/adapters/district-resolve";
import { getVenueImage } from "@/lib/ui/venue-image";
import type { DbVenueRow } from "@/types/supabase/database";
import type { DiscoveryVenue } from "@/types/event";

const DB_VENUE_CATEGORY_MAP: Record<string, DiscoveryVenue["venueType"]> = {
  hotel: "culture",
  restaurant: "culture",
  club: "arena",
  theater: "culture",
  other: "outdoor",
};

export function mapDbVenueCategory(
  raw: string | null | undefined
): DiscoveryVenue["venueType"] {
  if (!raw?.trim()) return "outdoor";
  const key = raw.trim().toLowerCase();
  return DB_VENUE_CATEGORY_MAP[key] ?? "outdoor";
}

function parseCoordinate(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function mapVenueRowToDiscoveryVenue(
  row: DbVenueRow,
  upcomingEventCount = 0
): DiscoveryVenue {
  const district = resolveVenueDistrict(row);
  const venueType = mapDbVenueCategory(row.venue_category);
  const photoSource = row.floor_plan_url?.trim() ?? "";

  const venue: DiscoveryVenue = {
    id: row.id,
    name: row.name.trim(),
    slug: buildVenueSlug(row.name, row.id),
    photo: photoSource,
    district,
    venueType,
    upcomingEventCount,
  };

  const lat = parseCoordinate(row.latitude);
  const lng = parseCoordinate(row.longitude);
  if (lat !== undefined && lng !== undefined) {
    venue.location = { latitude: lat, longitude: lng };
  }

  if (!venue.photo) {
    venue.photo = getVenueImage(venue);
  }

  return venue;
}

export function mapVenueRowsToDiscoveryVenues(
  rows: DbVenueRow[],
  upcomingCounts: Readonly<Record<string, number>> = {}
): DiscoveryVenue[] {
  return rows.map((row) =>
    mapVenueRowToDiscoveryVenue(row, upcomingCounts[row.id] ?? 0)
  );
}
