import { mapVenueRowsToDiscoveryVenues } from "@/lib/data/adapters/venue-mapper";
import {
  DISCOVERY_LIST_STATUSES,
  VENUE_DISCOVERY_SELECT,
} from "@/lib/data/supabase/queries";
import {
  formatCyprusDateFromIso,
  getCyprusDateString,
} from "@/lib/discovery/cyprus-date";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type { DbVenueRow } from "@/types/supabase/database";
import type { DiscoveryVenue } from "@/types/event";

async function fetchActiveVenueRows(): Promise<DbVenueRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("venues")
    .select(VENUE_DISCOVERY_SELECT)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Supabase venues fetch failed: ${error.message}`);
  }

  return (data ?? []) as unknown as DbVenueRow[];
}

/** Upcoming counts use Cyprus calendar dates — not UTC midnight. */
async function fetchUpcomingEventCountsByVenueId(): Promise<Record<string, number>> {
  const supabase = createSupabaseAnonClient();
  const today = getCyprusDateString();

  const { data, error } = await supabase
    .from("events")
    .select("venue_id, starts_at")
    .in("status", [...DISCOVERY_LIST_STATUSES]);

  if (error) {
    throw new Error(`Supabase venue event counts fetch failed: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { venue_id: string | null; starts_at: string }[]) {
    if (!row.venue_id || !row.starts_at) continue;
    const eventDate = formatCyprusDateFromIso(row.starts_at);
    if (eventDate < today) continue;
    counts[row.venue_id] = (counts[row.venue_id] ?? 0) + 1;
  }
  return counts;
}

export const supabaseVenuesRepository = {
  async getAll(): Promise<DiscoveryVenue[]> {
    const [rows, counts] = await Promise.all([
      fetchActiveVenueRows(),
      fetchUpcomingEventCountsByVenueId(),
    ]);
    return mapVenueRowsToDiscoveryVenues(rows, counts);
  },

  async getBySlug(slug: string): Promise<DiscoveryVenue | undefined> {
    const venues = await this.getAll();
    return venues.find((venue) => venue.slug === slug);
  },
};
