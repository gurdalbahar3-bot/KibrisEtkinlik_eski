import type { Json } from "@/types/supabase/database";

export type OrganizerRpcPayload = {
  success?: boolean;
  error_code?: string;
  event_id?: string;
  venue_id?: string;
  status?: string;
  noop?: boolean;
};

export function parseOrganizerRpcJson(data: Json | null): OrganizerRpcPayload {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data as OrganizerRpcPayload;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEventUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isVenueUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Staging create_venue_atomic args — no p_owner_id (owner = auth.uid()). */
export type StagingCreateVenueArgs = {
  p_name: string;
  p_venue_category?: string | null;
  p_address?: string | null;
  p_city?: string | null;
  p_region?: string | null;
  p_district_id?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_capacity?: number | null;
  p_floor_plan_url?: string | null;
  p_organization_id?: string | null;
};

/** Staging update_venue_atomic args — no p_owner_id. */
export type StagingUpdateVenueArgs = {
  p_venue_id: string;
  p_name?: string | null;
  p_venue_category?: string | null;
  p_address?: string | null;
  p_city?: string | null;
  p_region?: string | null;
  p_district_id?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_capacity?: number | null;
  p_floor_plan_url?: string | null;
  p_organization_id?: string | null;
};

export type StagingVenueStatusArgs = {
  p_venue_id: string;
};
