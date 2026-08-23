import {
  discoveryDistrictsRepository,
  discoveryEventsRepository,
  discoveryVenuesRepository,
} from "@/lib/data/discovery-repository";
import { isSupabaseDataSource } from "@/lib/supabase/config";

export interface AdminPublicDiscoveryStats {
  publishedEvents: number;
  activeVenues: number;
  districtCount: number;
  dataSource: "supabase" | "mock";
}

/** Public catalog counts for admin dashboard (READ-only, separate from mock intake KPIs). */
export async function getAdminPublicDiscoveryStats(): Promise<AdminPublicDiscoveryStats | null> {
  if (!isSupabaseDataSource()) {
    return null;
  }

  const [events, venues, districts] = await Promise.all([
    discoveryEventsRepository.getAll(),
    discoveryVenuesRepository.getAll(),
    discoveryDistrictsRepository.getAll(),
  ]);

  return {
    publishedEvents: events.length,
    activeVenues: venues.length,
    districtCount: districts.length,
    dataSource: "supabase",
  };
}
