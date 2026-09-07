"use server";

import { redirect } from "next/navigation";

import { CATEGORY_KEYS } from "@/lib/data/categories";
import { requireOrganizer } from "@/lib/organizer/auth";
import { updateOrganizerDraftEvent } from "@/lib/organizer/data/events";
import { listOrganizerActiveVenues } from "@/lib/organizer/data/venues";
import { isEventUuid, parseOrganizerRpcJson } from "@/lib/organizer/rpc";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/supabase/database";

type CreateEventArgs = Database["public"]["Functions"]["create_event_atomic"]["Args"];
type SubmitReviewArgs = Database["public"]["Functions"]["submit_event_for_review"]["Args"];

const CATEGORY_SET = new Set<string>(CATEGORY_KEYS);

function redirectNew(error: string): never {
  redirect(`/organizer/events/new?error=${encodeURIComponent(error)}`);
}

function redirectEdit(eventId: string, query: string): never {
  redirect(`/organizer/events/${eventId}?${query}`);
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
