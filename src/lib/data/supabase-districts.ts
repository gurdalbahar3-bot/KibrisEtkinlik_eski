import { mapDistrictRowsToDistrictInfo } from "@/lib/data/adapters/district-mapper";
import { mapEventRowsToDiscoveryEvents } from "@/lib/data/adapters/event-mapper";
import {
  DISCOVERY_LIST_STATUSES,
  DISTRICT_DISCOVERY_SELECT,
  EVENT_DISCOVERY_SELECT,
} from "@/lib/data/supabase/queries";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import { createSupabaseAnonClient } from "@/lib/supabase/anon-client";
import type { DbEventRow, DbKktcDistrictRow } from "@/types/supabase/database";
import type { DistrictInfo, DistrictSlug } from "@/types/event";

async function fetchDistrictRows(): Promise<DbKktcDistrictRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("kktc_districts")
    .select(DISTRICT_DISCOVERY_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Supabase districts fetch failed: ${error.message}`);
  }

  return (data ?? []) as unknown as DbKktcDistrictRow[];
}

/** District event counts mirror the discovery list pool (upcoming only). */
async function fetchDiscoveryListEventRows(): Promise<DbEventRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_DISCOVERY_SELECT)
    .in("status", [...DISCOVERY_LIST_STATUSES]);

  if (error) {
    throw new Error(`Supabase events fetch for district counts failed: ${error.message}`);
  }

  return (data ?? []) as unknown as DbEventRow[];
}

function buildDistrictEventCounts(): Promise<Partial<Record<DistrictSlug, number>>> {
  const today = getCyprusDateString();
  return fetchDiscoveryListEventRows().then((rows) => {
    const events = mapEventRowsToDiscoveryEvents(rows).filter((e) => e.date >= today);
    const counts: Partial<Record<DistrictSlug, number>> = {};
    for (const event of events) {
      counts[event.district] = (counts[event.district] ?? 0) + 1;
    }
    return counts;
  });
}

export const supabaseDistrictsRepository = {
  async getAll(): Promise<DistrictInfo[]> {
    const [districtRows, eventCounts] = await Promise.all([
      fetchDistrictRows(),
      buildDistrictEventCounts(),
    ]);
    return mapDistrictRowsToDistrictInfo(districtRows, eventCounts);
  },

  async getBySlug(slug: DistrictSlug): Promise<DistrictInfo | undefined> {
    const districts = await this.getAll();
    return districts.find((district) => district.slug === slug);
  },
};
