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
import { updateOrganizerDraftEvent } from "@/lib/organizer/data/events";
import { listOrganizerActiveVenues } from "@/lib/organizer/data/venues";
import {
  isEventFormatType,
  isEventUuid,
  parseOrganizerRpcJson,
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
