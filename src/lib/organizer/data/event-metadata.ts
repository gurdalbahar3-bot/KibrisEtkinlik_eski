import { getOrganizerEvent } from "@/lib/organizer/data/events";
import {
  parseOrganizerRpcJson,
  type StagingDeleteEventFormatArgs,
  type StagingDeleteEventLocationArgs,
  type StagingDeleteEventVenueContactArgs,
  type StagingDeleteEventWeddingDetailsArgs,
  type StagingUpsertEventFormatArgs,
  type StagingUpsertEventLocationArgs,
  type StagingUpsertEventVenueContactArgs,
  type StagingUpsertEventWeddingDetailsArgs,
} from "@/lib/organizer/rpc";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

export type OrganizerEventFormat = {
  id: string;
  formatType: string;
};

export type OrganizerEventLocation = {
  eventId: string;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  directionsText: string | null;
  districtId: string | null;
};

export type OrganizerEventVenueContact = {
  id: string;
  venueId: string;
  venueName: string;
  contactFullName: string;
  contactPhone: string;
  verificationStatus: string;
};

export type OrganizerWeddingDetails = {
  eventId: string;
  brideName: string;
  groomName: string;
  calendarExportUrl: string | null;
};

export type OrganizerEventMetadataBundle = {
  formats: OrganizerEventFormat[];
  location: OrganizerEventLocation | null;
  venueContact: OrganizerEventVenueContact | null;
  wedding: OrganizerWeddingDetails | null;
};

type FormatRow = { id: string; format_type: string };
type LocationRow = {
  event_id: string;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  directions_text: string | null;
  district_id: string | null;
};
type ContactRow = {
  id: string;
  venue_id: string;
  venue_name: string;
  contact_full_name: string;
  contact_phone: string;
  verification_status: string;
};
type WeddingRow = {
  event_id: string;
  bride_name: string;
  groom_name: string;
  calendar_export_url: string | null;
};

export type DraftEventGate =
  | {
      ok: true;
      event: {
        id: string;
        venueId: string;
        venueName: string | null;
        isWedding: boolean;
        isFree: boolean;
        status: string;
      };
    }
  | { ok: false; reason: "not_found" | "not_draft" };

/**
 * Server-side draft security gate for metadata mutations.
 * Staging metadata RPCs have no status check — app must enforce draft-only.
 */
export async function requireOwnedDraftEvent(
  eventId: string,
  ownerId: string
): Promise<DraftEventGate> {
  const event = await getOrganizerEvent(eventId, ownerId);
  if (!event) {
    return { ok: false, reason: "not_found" };
  }
  if (event.status !== "draft") {
    return { ok: false, reason: "not_draft" };
  }
  return {
    ok: true,
    event: {
      id: event.id,
      venueId: event.venueId,
      venueName: event.venueName,
      isWedding: event.isWedding,
      isFree: event.isFree,
      status: event.status,
    },
  };
}

/** Metadata tables are staging-live but omitted from hand-maintained Database Tables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedFrom = (table: string) => any;

export async function getOrganizerEventMetadata(
  eventId: string
): Promise<OrganizerEventMetadataBundle> {
  const supabase = await createSupabaseServerClient();
  const from = supabase.from.bind(supabase) as UntypedFrom;

  const [formatsRes, locationRes, contactRes, weddingRes] = await Promise.all([
    from("event_formats")
      .select("id, format_type")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    from("event_locations")
      .select(
        "event_id, address, city, region, latitude, longitude, directions_text, district_id"
      )
      .eq("event_id", eventId)
      .maybeSingle(),
    from("event_venue_contacts")
      .select(
        "id, venue_id, venue_name, contact_full_name, contact_phone, verification_status"
      )
      .eq("event_id", eventId)
      .maybeSingle(),
    from("wedding_details")
      .select("event_id, bride_name, groom_name, calendar_export_url")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  const formats = formatsRes.error
    ? []
    : ((formatsRes.data ?? []) as unknown as FormatRow[]).map((row) => ({
        id: row.id,
        formatType: row.format_type,
      }));

  const locationRow = locationRes.error
    ? null
    : (locationRes.data as unknown as LocationRow | null);
  const location: OrganizerEventLocation | null = locationRow
    ? {
        eventId: locationRow.event_id,
        address: locationRow.address,
        city: locationRow.city,
        region: locationRow.region,
        latitude: locationRow.latitude,
        longitude: locationRow.longitude,
        directionsText: locationRow.directions_text,
        districtId: locationRow.district_id,
      }
    : null;

  const contactRow = contactRes.error
    ? null
    : (contactRes.data as unknown as ContactRow | null);
  const venueContact: OrganizerEventVenueContact | null = contactRow
    ? {
        id: contactRow.id,
        venueId: contactRow.venue_id,
        venueName: contactRow.venue_name,
        contactFullName: contactRow.contact_full_name,
        contactPhone: contactRow.contact_phone,
        verificationStatus: contactRow.verification_status,
      }
    : null;

  const weddingRow = weddingRes.error
    ? null
    : (weddingRes.data as unknown as WeddingRow | null);
  const wedding: OrganizerWeddingDetails | null = weddingRow
    ? {
        eventId: weddingRow.event_id,
        brideName: weddingRow.bride_name,
        groomName: weddingRow.groom_name,
        calendarExportUrl: weddingRow.calendar_export_url,
      }
    : null;

  return { formats, location, venueContact, wedding };
}

type MetadataRpcName =
  | "upsert_event_format_atomic"
  | "delete_event_format_atomic"
  | "upsert_event_location_atomic"
  | "delete_event_location_atomic"
  | "upsert_event_venue_contact_atomic"
  | "delete_event_venue_contact_atomic"
  | "upsert_event_wedding_details_atomic"
  | "delete_event_wedding_details_atomic";

type MetadataRpcArgs =
  | StagingUpsertEventFormatArgs
  | StagingDeleteEventFormatArgs
  | StagingUpsertEventLocationArgs
  | StagingDeleteEventLocationArgs
  | StagingUpsertEventVenueContactArgs
  | StagingDeleteEventVenueContactArgs
  | StagingUpsertEventWeddingDetailsArgs
  | StagingDeleteEventWeddingDetailsArgs;

async function callMetadataRpc(
  fn: MetadataRpcName,
  args: MetadataRpcArgs
): Promise<{ data: Json | null; error: { message: string } | null }> {
  const supabase = await createSupabaseServerClient();
  return (supabase.rpc as unknown as (
    name: MetadataRpcName,
    params: MetadataRpcArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(fn, args);
}

export type MetadataMutationResult =
  | { ok: true; formatId?: string; contactId?: string; eventId?: string }
  | { ok: false; reason: string };

function mapRpcResult(data: Json | null, transportError: { message: string } | null): MetadataMutationResult {
  if (transportError) {
    return { ok: false, reason: "rpc_failed" };
  }
  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    return {
      ok: false,
      reason: (payload.error_code ?? "mutation_failed").toLowerCase(),
    };
  }
  return {
    ok: true,
    formatId: payload.format_id,
    contactId: payload.contact_id,
    eventId: payload.event_id,
  };
}

export async function upsertOrganizerEventFormat(
  args: StagingUpsertEventFormatArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc("upsert_event_format_atomic", args);
  return mapRpcResult(data, error);
}

export async function deleteOrganizerEventFormat(
  args: StagingDeleteEventFormatArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc("delete_event_format_atomic", args);
  return mapRpcResult(data, error);
}

export async function upsertOrganizerEventLocation(
  args: StagingUpsertEventLocationArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc("upsert_event_location_atomic", args);
  return mapRpcResult(data, error);
}

export async function deleteOrganizerEventLocation(
  args: StagingDeleteEventLocationArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc("delete_event_location_atomic", args);
  return mapRpcResult(data, error);
}

export async function upsertOrganizerEventVenueContact(
  args: StagingUpsertEventVenueContactArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc(
    "upsert_event_venue_contact_atomic",
    args
  );
  return mapRpcResult(data, error);
}

export async function deleteOrganizerEventVenueContact(
  args: StagingDeleteEventVenueContactArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc(
    "delete_event_venue_contact_atomic",
    args
  );
  return mapRpcResult(data, error);
}

export async function upsertOrganizerEventWeddingDetails(
  args: StagingUpsertEventWeddingDetailsArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc(
    "upsert_event_wedding_details_atomic",
    args
  );
  return mapRpcResult(data, error);
}

export async function deleteOrganizerEventWeddingDetails(
  args: StagingDeleteEventWeddingDetailsArgs
): Promise<MetadataMutationResult> {
  const { data, error } = await callMetadataRpc(
    "delete_event_wedding_details_atomic",
    args
  );
  return mapRpcResult(data, error);
}

/** Best-effort cleanup when is_wedding becomes false. Missing row is OK. */
export async function clearWeddingDetailsIfPresent(
  eventId: string
): Promise<void> {
  const result = await deleteOrganizerEventWeddingDetails({ p_event_id: eventId });
  if (!result.ok && result.reason !== "wedding_details_not_found") {
    // Non-fatal for draft field save; row may already be gone.
    return;
  }
}
