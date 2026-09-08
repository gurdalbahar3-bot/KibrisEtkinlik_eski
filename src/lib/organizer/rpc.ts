import type { Json } from "@/types/supabase/database";

export type OrganizerRpcPayload = {
  success?: boolean;
  error_code?: string;
  event_id?: string;
  venue_id?: string;
  format_id?: string;
  contact_id?: string;
  official_ticket_url?: string | null;
  artist_id?: string;
  slug?: string;
  created?: boolean;
  count?: number;
  zone_id?: string;
  ticket_type_id?: string;
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

export const EVENT_FORMAT_TYPES = [
  "general_admission",
  "seated",
  "table_reservation",
] as const;

export type EventFormatType = (typeof EVENT_FORMAT_TYPES)[number];

export function isEventFormatType(value: string): value is EventFormatType {
  return (EVENT_FORMAT_TYPES as readonly string[]).includes(value);
}

/** Staging upsert_event_format_atomic — no status gate; app enforces draft. */
export type StagingUpsertEventFormatArgs = {
  p_event_id: string;
  p_format_type: string;
  p_format_id?: string | null;
};

export type StagingDeleteEventFormatArgs = {
  p_event_id: string;
  p_format_id: string;
};

/** Staging upsert_event_location_atomic (049 signature with district_id). */
export type StagingUpsertEventLocationArgs = {
  p_event_id: string;
  p_address?: string | null;
  p_city?: string | null;
  p_region?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_directions_text?: string | null;
  p_district_id?: string | null;
};

export type StagingDeleteEventLocationArgs = {
  p_event_id: string;
};

export type StagingUpsertEventVenueContactArgs = {
  p_event_id: string;
  p_venue_id: string;
  p_venue_name: string;
  p_contact_full_name: string;
  p_contact_phone: string;
  p_contact_id?: string | null;
};

export type StagingDeleteEventVenueContactArgs = {
  p_event_id: string;
  p_contact_id: string;
};

export type StagingUpsertEventWeddingDetailsArgs = {
  p_event_id: string;
  p_bride_name: string;
  p_groom_name: string;
  p_calendar_export_url?: string | null;
};

export type StagingDeleteEventWeddingDetailsArgs = {
  p_event_id: string;
};

/** Staging 059 set_event_official_ticket_url — draft-only enforced in RPC + app gate. */
export type StagingSetEventOfficialTicketUrlArgs = {
  p_event_id: string;
  p_url?: string | null;
};

/** Staging 060 upsert_artist_atomic — create/update; app gates draft for panel mutations. */
export type StagingUpsertArtistArgs = {
  p_name: string;
  p_slug?: string | null;
  p_bio?: string | null;
  p_image_url?: string | null;
  p_is_active?: boolean | null;
  p_artist_id?: string | null;
};

export type StagingEventArtistPayloadItem = {
  artist_id: string;
  role?: string;
  sort_order?: number;
};

/** Staging 060 set_event_artists_atomic — replace-set; draft-only in RPC + app gate. */
export type StagingSetEventArtistsArgs = {
  p_event_id: string;
  p_artists: StagingEventArtistPayloadItem[];
};

export const EVENT_TICKET_ZONE_TYPES = [
  "standard",
  "front_row",
  "vip",
  "other",
] as const;

export type EventTicketZoneType = (typeof EVENT_TICKET_ZONE_TYPES)[number];

export function isEventTicketZoneType(value: string): value is EventTicketZoneType {
  return (EVENT_TICKET_ZONE_TYPES as readonly string[]).includes(value);
}

/**
 * Staging upsert_event_ticket_zone_atomic — exact identity args order:
 * (p_event_id, p_name, p_zone_type, p_sale_mode, p_capacity,
 *  p_venue_area_id, p_description, p_sort_order, p_is_active, p_zone_id)
 */
export type StagingUpsertEventTicketZoneArgs = {
  p_event_id: string;
  p_name: string;
  p_zone_type: string;
  p_sale_mode: string;
  p_capacity: number;
  p_venue_area_id?: string | null;
  p_description?: string | null;
  p_sort_order?: number | null;
  p_is_active?: boolean;
  p_zone_id?: string | null;
};

export type StagingDeactivateEventTicketZoneArgs = {
  p_event_id: string;
  p_zone_id: string;
};

/**
 * Staging upsert_event_ticket_type (034) — NOT *_atomic. Exact identity args:
 * (p_event_id, p_zone_id, p_name, p_price, p_description,
 *  p_max_per_order, p_is_active, p_ticket_type_id)
 */
export type StagingUpsertEventTicketTypeArgs = {
  p_event_id: string;
  p_zone_id: string;
  p_name: string;
  p_price: number;
  p_description?: string | null;
  p_max_per_order?: number | null;
  p_is_active?: boolean;
  p_ticket_type_id?: string | null;
};
