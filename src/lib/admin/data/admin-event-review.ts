import { resolveEventDistrict } from "@/lib/data/adapters/district-resolve";
import { normalizeEventCategory } from "@/lib/data/adapters/event-mapper";
import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbEventRow, DbProfileRow } from "@/types/supabase/database";
import type { DistrictSlug } from "@/types/event";

const REVIEW_EVENT_SELECT = `
  id,
  owner_id,
  venue_id,
  title,
  description,
  category,
  is_free,
  is_wedding,
  status,
  starts_at,
  ends_at,
  cover_image_url,
  created_at,
  venues (
    id,
    name,
    venue_category,
    city,
    region,
    latitude,
    longitude,
    floor_plan_url,
    status,
    district_id,
    kktc_districts ( code )
  ),
  event_locations (
    district_id,
    city,
    region,
    latitude,
    longitude,
    kktc_districts ( code )
  )
`.trim();

type ReviewEventRow = DbEventRow & {
  is_wedding?: boolean | null;
  created_at?: string | null;
  review_submitted_at?: string | null;
};

export interface AdminReviewEventListItem {
  id: string;
  title: string;
  status: string;
  category: string;
  district: DistrictSlug;
  venueName: string;
  startsAt: string;
  createdAt: string | null;
  reviewSubmittedAt: string | null;
  ownerId: string;
  ownerEmail: string | null;
  ownerLabel: string;
}

export interface AdminReviewEventDetail extends AdminReviewEventListItem {
  description: string | null;
  venueId: string;
  endsAt: string | null;
  isFree: boolean;
  isWedding: boolean;
  coverImageUrl: string | null;
}

async function isAuthenticatedSuperAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin");
  return Boolean(isSuperAdmin);
}

async function fetchOwnerProfiles(ownerIds: string[]): Promise<Map<string, DbProfileRow>> {
  if (ownerIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, account_type")
    .in("id", ownerIds);
  if (error) {
    throw new Error(`Admin review profiles read failed: ${error.message}`);
  }
  return new Map(((data ?? []) as DbProfileRow[]).map((profile) => [profile.id, profile]));
}

function mapReviewRow(
  row: ReviewEventRow,
  ownerById: Map<string, DbProfileRow>
): AdminReviewEventListItem {
  const owner = ownerById.get(row.owner_id);
  const district = resolveEventDistrict(row.venues, row.event_locations);
  return {
    id: row.id,
    title: row.title,
    status: String(row.status),
    category: normalizeEventCategory(row.category),
    district,
    venueName: row.venues?.name ?? "—",
    startsAt: row.starts_at,
    createdAt: row.created_at ?? null,
    reviewSubmittedAt: row.review_submitted_at ?? null,
    ownerId: row.owner_id,
    ownerEmail: owner?.email ?? null,
    ownerLabel: owner?.email ?? owner?.full_name ?? row.owner_id.slice(0, 8),
  };
}

/**
 * Super Admin queue: only status = in_review (user JWT + is_super_admin RLS).
 * Fail-closed when not authenticated as SA (no mock fallback).
 */
export async function getAdminInReviewEvents(): Promise<AdminReviewEventListItem[]> {
  if (!isSupabaseDataSource()) return [];
  if (!(await isAuthenticatedSuperAdmin())) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(REVIEW_EVENT_SELECT)
    .eq("status", "in_review")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Admin in_review events read failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ReviewEventRow[];
  const ownerById = await fetchOwnerProfiles([...new Set(rows.map((r) => r.owner_id))]);
  return rows.map((row) => mapReviewRow(row, ownerById));
}

/** SA detail for any event id (used for in_review approve + post-approve CTA). */
export async function getAdminReviewEventById(
  id: string
): Promise<AdminReviewEventDetail | null> {
  if (!isSupabaseDataSource()) return null;
  if (!(await isAuthenticatedSuperAdmin())) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(REVIEW_EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Admin review event detail read failed: ${error.message}`);
  }
  if (!data) return null;

  const row = data as unknown as ReviewEventRow;
  const ownerById = await fetchOwnerProfiles([row.owner_id]);
  const base = mapReviewRow(row, ownerById);

  return {
    ...base,
    description: row.description,
    venueId: row.venue_id,
    endsAt: row.ends_at,
    isFree: Boolean(row.is_free),
    isWedding: Boolean(row.is_wedding),
    coverImageUrl: row.cover_image_url,
  };
}


export interface AdminReviewTicketType {
  id: string;
  name: string;
  price: number;
  currency: "TRY";
  isActive: boolean;
}

export interface AdminReviewTicketZone {
  id: string;
  name: string;
  capacity: number;
  types: AdminReviewTicketType[];
}

export interface AdminReviewEventDetailWithTickets extends AdminReviewEventDetail {
  ticketZones: AdminReviewTicketZone[];
}

/** Ticket zones/types for SA review detail (user JWT + existing RLS). */
export async function getAdminReviewEventTicketCatalog(
  eventId: string
): Promise<AdminReviewTicketZone[]> {
  if (!isSupabaseDataSource()) return [];
  if (!(await isAuthenticatedSuperAdmin())) return [];

  const supabase = await createSupabaseServerClient();
  const [{ data: zones, error: zonesError }, { data: types, error: typesError }] =
    await Promise.all([
      supabase
        .from("event_ticket_zones")
        .select("id, name, capacity, sort_order, is_active")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("event_ticket_types")
        .select("id, zone_id, name, price, is_active")
        .eq("event_id", eventId)
        .order("name", { ascending: true }),
    ]);

  if (zonesError) {
    throw new Error(`Admin review ticket zones read failed: ${zonesError.message}`);
  }
  if (typesError) {
    throw new Error(`Admin review ticket types read failed: ${typesError.message}`);
  }

  const typesByZone = new Map<string, AdminReviewTicketType[]>();
  for (const row of types ?? []) {
    const zoneId = String((row as { zone_id: string }).zone_id);
    const list = typesByZone.get(zoneId) ?? [];
    list.push({
      id: String((row as { id: string }).id),
      name: String((row as { name: string }).name),
      price: Number((row as { price: number | string }).price),
      currency: "TRY",
      isActive: Boolean((row as { is_active: boolean }).is_active),
    });
    typesByZone.set(zoneId, list);
  }

  return ((zones ?? []) as Array<{
    id: string;
    name: string;
    capacity: number;
    is_active: boolean;
  }>).map((zone) => ({
    id: zone.id,
    name: zone.name,
    capacity: zone.capacity,
    types: typesByZone.get(zone.id) ?? [],
  }));
}

export async function getAdminReviewEventDetailWithTickets(
  id: string
): Promise<AdminReviewEventDetailWithTickets | null> {
  const event = await getAdminReviewEventById(id);
  if (!event) return null;
  const ticketZones = await getAdminReviewEventTicketCatalog(id);
  return { ...event, ticketZones };
}
