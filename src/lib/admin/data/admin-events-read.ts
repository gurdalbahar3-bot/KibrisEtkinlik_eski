import { resolveEventDistrict } from "@/lib/data/adapters/district-resolve";
import { normalizeEventCategory } from "@/lib/data/adapters/event-mapper";
import { discoveryEventsRepository } from "@/lib/data/discovery-repository";
import { EVENT_DISCOVERY_SELECT } from "@/lib/data/supabase/queries";
import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbEventRow, DbProfileRow } from "@/types/supabase/database";
import type { DistrictSlug } from "@/types/event";

export interface AdminEventListItem {
  id: string;
  title: string;
  status: string;
  category: string;
  district: DistrictSlug;
  venueName: string;
  startsAt: string;
  ownerId: string;
  ownerEmail: string | null;
  ownerLabel: string;
}

export interface AdminEventDetail extends AdminEventListItem {
  description: string | null;
  venueId: string;
}

const ADMIN_EVENT_SELECT = `
  owner_id,
  ${EVENT_DISCOVERY_SELECT}
`.trim();

function mapEventRow(
  row: DbEventRow,
  ownerById: Map<string, DbProfileRow>
): AdminEventListItem {
  const owner = ownerById.get(row.owner_id);
  const district = resolveEventDistrict(row.venues, row.event_locations);

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    category: normalizeEventCategory(row.category),
    district,
    venueName: row.venues?.name ?? "—",
    startsAt: row.starts_at,
    ownerId: row.owner_id,
    ownerEmail: owner?.email ?? null,
    ownerLabel: owner?.email ?? owner?.full_name ?? row.owner_id.slice(0, 8),
  };
}

async function fetchOwnerProfiles(ownerIds: string[]): Promise<Map<string, DbProfileRow>> {
  if (ownerIds.length === 0) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, account_type")
    .in("id", ownerIds);

  if (error) {
    throw new Error(`Admin profiles read failed: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as DbProfileRow[]).map((profile) => [profile.id, profile])
  );
}

async function isAuthenticatedSuperAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");
  return Boolean(isSuperAdmin);
}

async function fetchEventsViaAuthenticatedSupabase(): Promise<AdminEventListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(ADMIN_EVENT_SELECT)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Admin events read failed: ${error.message}`);
  }

  const rows = (data ?? []) as DbEventRow[];
  const ownerIds = [...new Set(rows.map((row) => row.owner_id))];
  const ownerById = await fetchOwnerProfiles(ownerIds);

  return rows.map((row) => mapEventRow(row, ownerById));
}

async function fetchEventByIdViaAuthenticatedSupabase(id: string): Promise<AdminEventDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(ADMIN_EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Admin event detail read failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as DbEventRow;
  const ownerById = await fetchOwnerProfiles([row.owner_id]);
  const base = mapEventRow(row, ownerById);

  return {
    ...base,
    description: row.description,
    venueId: row.venue_id,
  };
}

async function fetchEventsViaDiscoveryFallback(): Promise<AdminEventListItem[]> {
  const events = await discoveryEventsRepository.getAll();
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    status: "published",
    category: event.category,
    district: event.district,
    venueName: event.venue,
    startsAt: `${event.date}T${event.startTime}:00.000Z`,
    ownerId: "",
    ownerEmail: null,
    ownerLabel: "—",
  }));
}

async function fetchEventByIdViaDiscoveryFallback(id: string): Promise<AdminEventDetail | null> {
  const events = await discoveryEventsRepository.getAll();
  const event = events.find((item) => item.id === id);
  if (!event) {
    return null;
  }

  return {
    id: event.id,
    title: event.title,
    status: "published",
    category: event.category,
    district: event.district,
    venueName: event.venue,
    startsAt: `${event.date}T${event.startTime}:00.000Z`,
    ownerId: "",
    ownerEmail: null,
    ownerLabel: "—",
    description: event.description,
    venueId: event.venueSlug,
  };
}

/** Super-admin authenticated READ; dev-auth falls back to public discovery published list. */
export async function getAdminPublicEvents(): Promise<AdminEventListItem[]> {
  if (!isSupabaseDataSource()) {
    return [];
  }

  if (await isAuthenticatedSuperAdmin()) {
    return fetchEventsViaAuthenticatedSupabase();
  }

  return fetchEventsViaDiscoveryFallback();
}

export async function getAdminPublicEventById(id: string): Promise<AdminEventDetail | null> {
  if (!isSupabaseDataSource()) {
    return null;
  }

  if (await isAuthenticatedSuperAdmin()) {
    return fetchEventByIdViaAuthenticatedSupabase(id);
  }

  return fetchEventByIdViaDiscoveryFallback(id);
}
