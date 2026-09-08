"use server";

import { redirect } from "next/navigation";

import { CATEGORY_KEYS } from "@/lib/data/categories";
import { requireOrganizer } from "@/lib/organizer/auth";
import {
  clearWeddingDetailsIfPresent,
  deleteOrganizerEventFormat,
  deleteOrganizerEventLocation,
  deleteOrganizerEventVenueContact,
  deleteOrganizerEventWeddingDetails,
  requireOwnedDraftEvent,
  upsertOrganizerEventFormat,
  upsertOrganizerEventLocation,
  upsertOrganizerEventVenueContact,
  upsertOrganizerEventWeddingDetails,
} from "@/lib/organizer/data/event-metadata";
import {
  setOrganizerEventArtists,
  upsertOrganizerArtist,
  type UpsertOrganizerArtistResult,
} from "@/lib/organizer/data/artists";
import {
  deactivateOrganizerEventTicketZone,
  upsertOrganizerEventTicketType,
  upsertOrganizerEventTicketZone,
} from "@/lib/organizer/data/ticket-commerce";
import { updateOrganizerDraftEvent, setOrganizerOfficialTicketUrl } from "@/lib/organizer/data/events";
import { listOrganizerActiveVenues } from "@/lib/organizer/data/venues";
import {
  isEventFormatType,
  isEventTicketZoneType,
  isEventUuid,
  parseOrganizerRpcJson,
  type StagingEventArtistPayloadItem,
} from "@/lib/organizer/rpc";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/supabase/database";

type CreateEventArgs = Database["public"]["Functions"]["create_event_atomic"]["Args"];
type SubmitReviewArgs = Database["public"]["Functions"]["submit_event_for_review"]["Args"];

const CATEGORY_SET = new Set<string>(CATEGORY_KEYS);

type MetaSection = "format" | "location" | "contact" | "wedding";

function redirectNew(error: string): never {
  redirect(`/organizer/events/new?error=${encodeURIComponent(error)}`);
}

function redirectEdit(eventId: string, query: string): never {
  redirect(`/organizer/events/${eventId}?${query}`);
}

function redirectMetaOk(eventId: string, meta: string): never {
  redirectEdit(eventId, `meta=${encodeURIComponent(meta)}`);
}

function redirectMetaError(eventId: string, section: MetaSection, error: string): never {
  redirectEdit(
    eventId,
    `meta_section=${encodeURIComponent(section)}&meta_error=${encodeURIComponent(error)}`
  );
}

function parseOptionalDateTime(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseRequiredDateTime(raw: string): string | null {
  return parseOptionalDateTime(raw);
}

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function parseCoordinates(formData: FormData):
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; error: string } {
  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();

  if (!latRaw && !lngRaw) {
    return { ok: true, latitude: null, longitude: null };
  }
  if (!latRaw || !lngRaw) {
    return { ok: false, error: "invalid_coordinates" };
  }

  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: "invalid_coordinates" };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, error: "invalid_coordinates" };
  }
  return { ok: true, latitude, longitude };
}

async function callRpc(
  fn: "create_event_atomic" | "submit_event_for_review",
  args: CreateEventArgs | SubmitReviewArgs
): Promise<{ data: Json | null; error: { message: string } | null }> {
  const supabase = await createSupabaseServerClient();
  // Hand-maintained Database types collapse RPC Args inference (same as publish_event).
  return (supabase.rpc as unknown as (
    name: typeof fn,
    params: typeof args
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(fn, args);
}

async function gateDraftMetadata(
  eventId: string,
  ownerId: string,
  section: MetaSection
): Promise<{
  id: string;
  venueId: string;
  venueName: string | null;
  isWedding: boolean;
}> {
  const gate = await requireOwnedDraftEvent(eventId, ownerId);
  if (!gate.ok) {
    redirectMetaError(
      eventId,
      section,
      gate.reason === "not_draft" ? "not_draft" : "not_found"
    );
  }
  return gate.event;
}

export async function createOrganizerEventAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirectNew("config");
  }

  const session = await requireOrganizer();
  if (session.verificationStatus !== "approved") {
    redirectNew("not_eligible");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const venueId = String(formData.get("venue_id") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const startsRaw = String(formData.get("starts_at") ?? "");
  const endsRaw = String(formData.get("ends_at") ?? "");
  const cover = String(formData.get("cover") ?? "").trim();
  const isFree = String(formData.get("is_free") ?? "") === "on";
  const isWedding =
    String(formData.get("is_wedding") ?? "") === "on" || category === "wedding";

  if (!title) redirectNew("title_required");
  if (!venueId || !isEventUuid(venueId)) redirectNew("venue_required");
  if (!category || !CATEGORY_SET.has(category)) redirectNew("category_required");

  const startsAt = parseRequiredDateTime(startsRaw);
  if (!startsAt) redirectNew("starts_at_required");

  const endsAt = parseOptionalDateTime(endsRaw);
  if (endsRaw.trim() && !endsAt) redirectNew("ends_at_invalid");
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    redirectNew("ends_before_start");
  }

  const venues = await listOrganizerActiveVenues(session.userId);
  if (!venues.some((v) => v.id === venueId)) {
    redirectNew("venue_forbidden");
  }

  const rpcArgs: CreateEventArgs = {
    p_title: title,
    p_venue_id: venueId,
    p_category: category,
    p_starts_at: startsAt,
    p_description: description || null,
    p_ends_at: endsAt,
    p_cover: cover || null,
    p_is_free: isFree,
    p_is_wedding: isWedding,
    p_owner_id: session.userId,
    p_organization_id: null,
  };

  const { data, error } = await callRpc("create_event_atomic", rpcArgs);

  if (error) {
    redirectNew("rpc_failed");
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success || !payload.event_id || !isEventUuid(payload.event_id)) {
    redirectNew(payload.error_code?.toLowerCase() || "create_failed");
  }

  redirect(`/organizer/events/${payload.event_id}?created=1`);
}

export async function updateOrganizerDraftEventAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const cover = String(formData.get("cover") ?? "").trim();
  const isFree = String(formData.get("is_free") ?? "") === "on";
  const isWedding =
    String(formData.get("is_wedding") ?? "") === "on" || category === "wedding";

  if (!title) redirectEdit(eventId, "error=title_required");
  if (!category || !CATEGORY_SET.has(category)) {
    redirectEdit(eventId, "error=category_required");
  }

  const result = await updateOrganizerDraftEvent(eventId, session.userId, {
    title,
    description: description || null,
    category,
    isFree,
    isWedding,
    coverImageUrl: cover || null,
  });

  if (!result.ok) {
    redirectEdit(
      eventId,
      result.reason === "not_found" ? "error=not_found" : "error=update_failed"
    );
  }

  if (!isWedding) {
    await clearWeddingDetailsIfPresent(eventId);
  }

  redirectEdit(eventId, "saved=1");
}

export async function submitOrganizerEventForReviewAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  const supabase = await createSupabaseServerClient();
  const { data: ownedRaw } = await supabase
    .from("events")
    .select("id, status")
    .eq("id", eventId)
    .eq("owner_id", session.userId)
    .maybeSingle();

  const owned = ownedRaw as unknown as { id: string; status: string } | null;
  if (!owned) {
    redirectEdit(eventId, "error=not_found");
  }
  if (String(owned.status) !== "draft") {
    redirectEdit(eventId, "error=invalid_transition");
  }

  const { data, error } = await callRpc("submit_event_for_review", {
    p_event_id: eventId,
  });

  if (error) {
    redirectEdit(eventId, "error=rpc_failed");
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    redirectEdit(eventId, `error=${(payload.error_code ?? "submit_failed").toLowerCase()}`);
  }

  redirectEdit(eventId, "submitted=1");
}

export async function upsertOrganizerEventFormatAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  await gateDraftMetadata(eventId, session.userId, "format");

  const formatType = String(formData.get("format_type") ?? "").trim();
  if (!isEventFormatType(formatType)) {
    redirectMetaError(eventId, "format", "invalid_format_type");
  }

  const result = await upsertOrganizerEventFormat({
    p_event_id: eventId,
    p_format_type: formatType,
    p_format_id: null,
  });

  if (!result.ok) {
    redirectMetaError(eventId, "format", result.reason);
  }

  redirectMetaOk(eventId, "format_saved");
}

export async function deleteOrganizerEventFormatAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const formatId = String(formData.get("format_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }
  if (!isEventUuid(formatId)) {
    redirectMetaError(eventId, "format", "format_not_found");
  }

  await gateDraftMetadata(eventId, session.userId, "format");

  const result = await deleteOrganizerEventFormat({
    p_event_id: eventId,
    p_format_id: formatId,
  });

  if (!result.ok) {
    redirectMetaError(eventId, "format", result.reason);
  }

  redirectMetaOk(eventId, "format_deleted");
}

export async function upsertOrganizerEventLocationAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  await gateDraftMetadata(eventId, session.userId, "location");

  const districtId = optionalText(formData, "district_id");
  if (districtId && !isEventUuid(districtId)) {
    redirectMetaError(eventId, "location", "invalid_district");
  }

  const coords = parseCoordinates(formData);
  if (!coords.ok) {
    redirectMetaError(eventId, "location", coords.error);
  }

  const result = await upsertOrganizerEventLocation({
    p_event_id: eventId,
    p_address: optionalText(formData, "address"),
    p_city: optionalText(formData, "city"),
    p_region: optionalText(formData, "region"),
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_directions_text: optionalText(formData, "directions_text"),
    p_district_id: districtId,
  });

  if (!result.ok) {
    redirectMetaError(eventId, "location", result.reason);
  }

  redirectMetaOk(eventId, "location_saved");
}

export async function deleteOrganizerEventLocationAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  await gateDraftMetadata(eventId, session.userId, "location");

  const result = await deleteOrganizerEventLocation({ p_event_id: eventId });
  if (!result.ok) {
    redirectMetaError(eventId, "location", result.reason);
  }

  redirectMetaOk(eventId, "location_deleted");
}

export async function upsertOrganizerEventVenueContactAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  const event = await gateDraftMetadata(eventId, session.userId, "contact");

  const contactFullName = String(formData.get("contact_full_name") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const contactIdRaw = optionalText(formData, "contact_id");

  if (!contactFullName) {
    redirectMetaError(eventId, "contact", "contact_name_required");
  }
  if (!contactPhone) {
    redirectMetaError(eventId, "contact", "contact_phone_required");
  }
  if (!event.venueName) {
    redirectMetaError(eventId, "contact", "venue_name_required");
  }
  if (contactIdRaw && !isEventUuid(contactIdRaw)) {
    redirectMetaError(eventId, "contact", "contact_not_found");
  }

  const result = await upsertOrganizerEventVenueContact({
    p_event_id: eventId,
    p_venue_id: event.venueId,
    p_venue_name: event.venueName,
    p_contact_full_name: contactFullName,
    p_contact_phone: contactPhone,
    p_contact_id: contactIdRaw,
  });

  if (!result.ok) {
    redirectMetaError(eventId, "contact", result.reason);
  }

  redirectMetaOk(eventId, "contact_saved");
}

export async function deleteOrganizerEventVenueContactAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const contactId = String(formData.get("contact_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }
  if (!isEventUuid(contactId)) {
    redirectMetaError(eventId, "contact", "contact_not_found");
  }

  await gateDraftMetadata(eventId, session.userId, "contact");

  const result = await deleteOrganizerEventVenueContact({
    p_event_id: eventId,
    p_contact_id: contactId,
  });

  if (!result.ok) {
    redirectMetaError(eventId, "contact", result.reason);
  }

  redirectMetaOk(eventId, "contact_deleted");
}

export async function upsertOrganizerEventWeddingDetailsAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  const event = await gateDraftMetadata(eventId, session.userId, "wedding");
  if (!event.isWedding) {
    redirectMetaError(eventId, "wedding", "not_wedding_event");
  }

  const brideName = String(formData.get("bride_name") ?? "").trim();
  const groomName = String(formData.get("groom_name") ?? "").trim();
  const calendarExportUrl = optionalText(formData, "calendar_export_url");

  if (!brideName) {
    redirectMetaError(eventId, "wedding", "bride_name_required");
  }
  if (!groomName) {
    redirectMetaError(eventId, "wedding", "groom_name_required");
  }

  const result = await upsertOrganizerEventWeddingDetails({
    p_event_id: eventId,
    p_bride_name: brideName,
    p_groom_name: groomName,
    p_calendar_export_url: calendarExportUrl,
  });

  if (!result.ok) {
    redirectMetaError(eventId, "wedding", result.reason);
  }

  redirectMetaOk(eventId, "wedding_saved");
}

export async function deleteOrganizerEventWeddingDetailsAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  await gateDraftMetadata(eventId, session.userId, "wedding");

  const result = await deleteOrganizerEventWeddingDetails({ p_event_id: eventId });
  if (!result.ok) {
    redirectMetaError(eventId, "wedding", result.reason);
  }

  redirectMetaOk(eventId, "wedding_deleted");
}

function redirectTicketOk(eventId: string): never {
  redirectEdit(eventId, "ticket=saved");
}

function redirectTicketError(eventId: string, error: string): never {
  redirectEdit(eventId, `ticket_error=${encodeURIComponent(error)}`);
}

export async function setOrganizerEventOfficialTicketUrlAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  const gate = await requireOwnedDraftEvent(eventId, session.userId);
  if (!gate.ok) {
    redirectTicketError(
      eventId,
      gate.reason === "not_draft" ? "not_draft" : "not_found"
    );
  }

  // Empty / whitespace → NULL clear (RPC also normalizes).
  const rawUrl = String(formData.get("official_ticket_url") ?? "").trim();
  const pUrl = rawUrl.length > 0 ? rawUrl : null;

  const result = await setOrganizerOfficialTicketUrl({
    p_event_id: eventId,
    p_url: pUrl,
  });

  if (!result.ok) {
    redirectTicketError(eventId, result.reason);
  }

  redirectTicketOk(eventId);
}

function redirectArtistsOk(eventId: string): never {
  redirectEdit(eventId, "artists=saved");
}

function redirectArtistsError(eventId: string, error: string): never {
  redirectEdit(eventId, `artists_error=${encodeURIComponent(error)}`);
}

const ARTIST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArtistsPayload(raw: string): StagingEventArtistPayloadItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const items: StagingEventArtistPayloadItem[] = [];
  const seen = new Set<string>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const artistId = String(row.artist_id ?? "").trim();
    if (!ARTIST_UUID_RE.test(artistId)) return null;
    if (seen.has(artistId.toLowerCase())) return null;
    seen.add(artistId.toLowerCase());

    const roleRaw = String(row.role ?? "").trim();
    const role = roleRaw.length > 0 ? roleRaw.slice(0, 80) : "performer";
    const sortRaw = row.sort_order;
    const sortOrder =
      typeof sortRaw === "number" && Number.isFinite(sortRaw)
        ? Math.trunc(sortRaw)
        : items.length;

    items.push({
      artist_id: artistId,
      role,
      sort_order: sortOrder,
    });
  }

  return items.map((item, index) => ({
    ...item,
    sort_order: index,
  }));
}

/**
 * Create artist via upsert_artist_atomic (no client DML).
 * Returns payload for client local-list merge; draft-gated for panel use.
 */
export async function createOrganizerArtistAction(
  formData: FormData
): Promise<UpsertOrganizerArtistResult> {
  if (!getSupabasePublicEnv()) {
    return { ok: false, reason: "config" };
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    return { ok: false, reason: "event_not_found" };
  }

  const gate = await requireOwnedDraftEvent(eventId, session.userId);
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason === "not_draft" ? "not_draft" : "not_found",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { ok: false, reason: "name_required" };
  }

  const slugRaw = String(formData.get("slug") ?? "").trim();
  const bioRaw = String(formData.get("bio") ?? "").trim();
  const imageRaw = String(formData.get("image_url") ?? "").trim();

  return upsertOrganizerArtist({
    p_name: name,
    p_slug: slugRaw.length > 0 ? slugRaw : null,
    p_bio: bioRaw.length > 0 ? bioRaw : null,
    p_image_url: imageRaw.length > 0 ? imageRaw : null,
    p_is_active: null,
    p_artist_id: null,
  });
}

/** Replace event_artists set via set_event_artists_atomic (draft-gated). */
export async function setOrganizerEventArtistsAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  const gate = await requireOwnedDraftEvent(eventId, session.userId);
  if (!gate.ok) {
    redirectArtistsError(
      eventId,
      gate.reason === "not_draft" ? "not_draft" : "not_found"
    );
  }

  const rawPayload = String(formData.get("artists_json") ?? "").trim();
  const artists = parseArtistsPayload(rawPayload.length > 0 ? rawPayload : "[]");
  if (!artists) {
    redirectArtistsError(eventId, "invalid_artists");
  }

  const result = await setOrganizerEventArtists({
    p_event_id: eventId,
    p_artists: artists,
  });

  if (!result.ok) {
    redirectArtistsError(eventId, result.reason);
  }

  redirectArtistsOk(eventId);
}

function redirectCommerceOk(eventId: string, ok: string): never {
  redirectEdit(eventId, `commerce=${encodeURIComponent(ok)}`);
}

function redirectCommerceError(eventId: string, error: string): never {
  redirectEdit(eventId, `commerce_error=${encodeURIComponent(error)}`);
}

async function gateDraftCommerce(
  eventId: string,
  ownerId: string
): Promise<void> {
  const gate = await requireOwnedDraftEvent(eventId, ownerId);
  if (!gate.ok) {
    redirectCommerceError(
      eventId,
      gate.reason === "not_draft" ? "not_draft" : "not_found"
    );
  }
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseRequiredPositiveInt(raw: string): number | null {
  const n = parseOptionalInt(raw);
  if (n === null || n <= 0) return null;
  return n;
}

function parseNonNegativePrice(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** P0.8: create/update ticket_based zone only. */
export async function upsertOrganizerEventTicketZoneAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/organizer");
  }

  await gateDraftCommerce(eventId, session.userId);

  const zoneIdRaw = String(formData.get("zone_id") ?? "").trim();
  const zoneId = zoneIdRaw && isEventUuid(zoneIdRaw) ? zoneIdRaw : null;
  const name = String(formData.get("name") ?? "").trim();
  const zoneType = String(formData.get("zone_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sortOrder = parseOptionalInt(String(formData.get("sort_order") ?? ""));
  const capacity = parseRequiredPositiveInt(
    String(formData.get("capacity") ?? "")
  );
  const isActive = String(formData.get("is_active") ?? "true") !== "false";

  if (!name) {
    redirectCommerceError(eventId, "name_required");
  }
  if (!isEventTicketZoneType(zoneType)) {
    redirectCommerceError(eventId, "invalid_zone_type");
  }
  if (capacity === null) {
    redirectCommerceError(eventId, "invalid_capacity");
  }

  // P0.8 hard-lock: never create/edit as seat_based from this UI.
  const result = await upsertOrganizerEventTicketZone({
    p_event_id: eventId,
    p_name: name,
    p_zone_type: zoneType,
    p_sale_mode: "ticket_based",
    p_capacity: capacity,
    p_venue_area_id: null,
    p_description: description.length > 0 ? description : null,
    p_sort_order: sortOrder,
    p_is_active: isActive,
    p_zone_id: zoneId,
  });

  if (!result.ok) {
    redirectCommerceError(eventId, result.reason);
  }

  redirectCommerceOk(eventId, zoneId ? "zone_saved" : "zone_created");
}

export async function deactivateOrganizerEventTicketZoneAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const zoneId = String(formData.get("zone_id") ?? "").trim();
  if (!isEventUuid(eventId) || !isEventUuid(zoneId)) {
    redirect("/organizer");
  }

  await gateDraftCommerce(eventId, session.userId);

  const result = await deactivateOrganizerEventTicketZone({
    p_event_id: eventId,
    p_zone_id: zoneId,
  });

  if (!result.ok) {
    redirectCommerceError(eventId, result.reason);
  }

  redirectCommerceOk(eventId, "zone_deactivated");
}

/** Create/update ticket type (price TRY). Deactivate via p_is_active=false. */
export async function upsertOrganizerEventTicketTypeAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const zoneId = String(formData.get("zone_id") ?? "").trim();
  if (!isEventUuid(eventId) || !isEventUuid(zoneId)) {
    redirect("/organizer");
  }

  await gateDraftCommerce(eventId, session.userId);

  const typeIdRaw = String(formData.get("ticket_type_id") ?? "").trim();
  const typeId = typeIdRaw && isEventUuid(typeIdRaw) ? typeIdRaw : null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const price = parseNonNegativePrice(String(formData.get("price") ?? ""));
  const maxPerOrder = parseOptionalInt(
    String(formData.get("max_per_order") ?? "")
  );
  const isActive = String(formData.get("is_active") ?? "true") !== "false";

  if (!name) {
    redirectCommerceError(eventId, "name_required");
  }
  if (price === null) {
    redirectCommerceError(eventId, "invalid_price");
  }
  if (maxPerOrder !== null && maxPerOrder <= 0) {
    redirectCommerceError(eventId, "invalid_max_per_order");
  }

  const result = await upsertOrganizerEventTicketType({
    p_event_id: eventId,
    p_zone_id: zoneId,
    p_name: name,
    p_price: price,
    p_description: description.length > 0 ? description : null,
    p_max_per_order: maxPerOrder,
    p_is_active: isActive,
    p_ticket_type_id: typeId,
  });

  if (!result.ok) {
    redirectCommerceError(eventId, result.reason);
  }

  redirectCommerceOk(
    eventId,
    !isActive && typeId ? "type_deactivated" : typeId ? "type_saved" : "type_created"
  );
}
