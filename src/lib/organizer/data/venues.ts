import { createSupabaseServerClient } from "@/lib/supabase/server";

export const VENUE_CATEGORIES = [
  "hotel",
  "restaurant",
  "club",
  "theater",
  "other",
] as const;

export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export type OrganizerVenueOption = {
  id: string;
  name: string;
  city: string | null;
  status: string;
};

export type OrganizerVenueListItem = {
  id: string;
  name: string;
  city: string | null;
  venueCategory: string | null;
  status: string;
  updatedAt: string;
  eventEligible: boolean;
};

export type OrganizerVenueDetail = {
  id: string;
  ownerId: string;
  name: string;
  venueCategory: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  districtId: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  floorPlanUrl: string | null;
  organizationId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizerDistrictOption = {
  id: string;
  code: string;
  nameTr: string;
  nameEn: string;
};

type VenueListRow = {
  id: string;
  name: string;
  city: string | null;
  venue_category: string | null;
  status: string;
  updated_at: string;
};

type VenueDetailRow = {
  id: string;
  owner_id: string;
  name: string;
  venue_category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  district_id: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  floor_plan_url: string | null;
  organization_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type DistrictRow = {
  id: string;
  code: string;
  name_tr: string;
  name_en: string;
};

/** Active venues owned by the organizer (event create requires status = active). */
export async function listOrganizerActiveVenues(
  ownerId: string
): Promise<OrganizerVenueOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, city, status")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as unknown as OrganizerVenueOption[]).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    status: String(row.status),
  }));
}

/** All owned venues (active + inactive) for venue management. */
export async function listOrganizerVenues(
  ownerId: string
): Promise<OrganizerVenueListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, city, venue_category, status, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as unknown as VenueListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    venueCategory: row.venue_category,
    status: String(row.status),
    updatedAt: row.updated_at,
    eventEligible: String(row.status) === "active",
  }));
}

/**
 * Venue detail for management. Requires can_manage_venue (owner/org/SA).
 * Does not trust client-supplied owner_id.
 */
export async function getOrganizerVenue(
  venueId: string
): Promise<OrganizerVenueDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: canManage, error: manageError } = await (supabase.rpc as unknown as (
    name: "can_manage_venue",
    params: { p_venue_id: string }
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>)(
    "can_manage_venue",
    { p_venue_id: venueId }
  );
  if (manageError || canManage !== true) {
    return null;
  }

  const { data, error } = await supabase
    .from("venues")
    .select(
      "id, owner_id, name, venue_category, address, city, region, district_id, latitude, longitude, capacity, floor_plan_url, organization_id, status, created_at, updated_at"
    )
    .eq("id", venueId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as VenueDetailRow;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    venueCategory: row.venue_category,
    address: row.address,
    city: row.city,
    region: row.region,
    districtId: row.district_id,
    latitude: row.latitude,
    longitude: row.longitude,
    capacity: row.capacity,
    floorPlanUrl: row.floor_plan_url,
    organizationId: row.organization_id,
    status: String(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listActiveDistrictOptions(): Promise<OrganizerDistrictOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kktc_districts")
    .select("id, code, name_tr, name_en")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as unknown as DistrictRow[]).map((row) => ({
    id: row.id,
    code: row.code,
    nameTr: row.name_tr,
    nameEn: row.name_en,
  }));
}

export function isVenueCategory(value: string): value is VenueCategory {
  return (VENUE_CATEGORIES as readonly string[]).includes(value);
}
