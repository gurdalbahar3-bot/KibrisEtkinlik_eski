import { mapVenueRowsToDiscoveryVenues } from "@/lib/data/adapters/venue-mapper";
import {
  PUBLIC_EVENT_STATUSES,
  VENUE_DISCOVERY_SELECT,
} from "@/lib/data/supabase/queries";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
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

async function fetchUpcomingEventCountsByVenueId(): Promise<Record<string, number>> {
  const supabase = createSupabaseAnonClient();
  const today = getCyprusDateString();
  const fromIso = `${today}T00:00:00.000Z`;

  const { data, error } = await supabase
    .from("events")
    .select("venue_id")
    .gte("starts_at", fromIso)
    .in("status", [...PUBLIC_EVENT_STATUSES]);

  if (error) {
    throw new Error(`Supabase venue event counts fetch failed: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { venue_id: string }[]) {
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
