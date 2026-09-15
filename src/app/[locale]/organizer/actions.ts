"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getProfileForUser,
  getSessionUser,
  isApprovedOrganizerAccount,
} from "@/lib/auth/session";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import {
  cyprusLocalInputToIso,
  rpcUpsertTicketType,
  rpcUpsertTicketZone,
} from "@/lib/organizer/data";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventCategory } from "@/types/event";

export type ActionState = {
  ok: boolean;
  errorCode?: string;
  message?: string;
  eventId?: string;
  zoneId?: string;
};

async function assertOrganizerActor() {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false as const, errorCode: "UNAUTHENTICATED" };
  }
  const profile = await getProfileForUser(user.id);
  if (!profile || !isApprovedOrganizerAccount(profile)) {
    return { ok: false as const, errorCode: "FORBIDDEN" };
  }
  return { ok: true as const, user, profile };
}

export async function loginAction(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();
  const locale = String(formData.get("locale") ?? "tr").trim() || "tr";

  if (!email || !password) {
    return { ok: false, errorCode: "MISSING_CREDENTIALS" };
  }

  if (!getSupabasePublicEnv()) {
    return { ok: false, errorCode: "LOGIN_FAILED" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, errorCode: "LOGIN_FAILED", message: error.message };
  }

  const fallback = `/${locale}/organizer`;
  const safeNext =
    next.startsWith(`/${locale}/organizer`) || next === fallback
      ? next
      : fallback;

  redirect(safeNext);
}

export async function logoutAction(formData: FormData): Promise<void> {
  void formData;
  if (getSupabasePublicEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  // Locale organizer shell logs out to Organizer OS login — not customer /giris.
  redirect("/organizer/login");
}

export async function createEventAction(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await assertOrganizerActor();
  if (!actor.ok) return { ok: false, errorCode: actor.errorCode };

  const locale = String(formData.get("locale") ?? "tr");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const venueId = String(formData.get("venue_id") ?? "").trim();
  const startsLocal = String(formData.get("starts_at") ?? "").trim();
  const endsLocal = String(formData.get("ends_at") ?? "").trim();
  const coverImageUrl = String(formData.get("cover_image_url") ?? "").trim();
  const isFree = String(formData.get("is_free") ?? "") === "true";

  if (!title || !venueId || !startsLocal || !endsLocal || !category) {
    return { ok: false, errorCode: "MISSING_FIELDS" };
  }

  if (!CATEGORY_KEYS.includes(category as EventCategory)) {
    return { ok: false, errorCode: "INVALID_CATEGORY" };
  }

  const startsAt = cyprusLocalInputToIso(startsLocal);
  const endsAt = cyprusLocalInputToIso(endsLocal);
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
    return { ok: false, errorCode: "INVALID_DATES" };
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { ok: false, errorCode: "END_BEFORE_START" };
  }

  const supabase = await createSupabaseServerClient();

  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("id, status")
    .eq("id", venueId)
    .eq("status", "active")
    .maybeSingle();

  if (venueError || !venue) {
    return { ok: false, errorCode: "VENUE_NOT_AVAILABLE" };
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      owner_id: actor.user.id,
      venue_id: venueId,
      title,
      description: description || null,
      category,
      is_free: isFree,
      is_wedding: category === "wedding",
      starts_at: startsAt,
      ends_at: endsAt,
      cover_image_url: coverImageUrl || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, errorCode: "CREATE_FAILED", message: error?.message };
  }

  revalidatePath(`/${locale}/organizer`);
  revalidatePath(`/${locale}/organizer/events`);
  redirect(`/${locale}/organizer/events/${data.id}/tickets`);
}

export async function saveTicketSetupAction(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const actor = await assertOrganizerActor();
  if (!actor.ok) return { ok: false, errorCode: actor.errorCode };

  const locale = String(formData.get("locale") ?? "tr");
  const eventId = String(formData.get("event_id") ?? "").trim();
  const zoneId = String(formData.get("zone_id") ?? "").trim() || undefined;
  const ticketTypeId =
    String(formData.get("ticket_type_id") ?? "").trim() || undefined;
  const zoneName = String(formData.get("zone_name") ?? "").trim();
  const ticketName = String(formData.get("ticket_name") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();

  if (!eventId || !zoneName || !ticketName || !capacityRaw || !priceRaw) {
    return { ok: false, errorCode: "MISSING_FIELDS" };
  }

  const capacity = Number.parseInt(capacityRaw, 10);
  const price = Number.parseFloat(priceRaw);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { ok: false, errorCode: "INVALID_CAPACITY" };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, errorCode: "INVALID_PRICE" };
  }

  const priceRounded = Math.round(price * 100) / 100;

  const zoneResult = await rpcUpsertTicketZone({
    eventId,
    name: zoneName,
    capacity,
    zoneId,
  });
  if (!zoneResult.success || !zoneResult.zone_id) {
    return {
      ok: false,
      errorCode: zoneResult.error_code ?? "ZONE_UPSERT_FAILED",
    };
  }

  const typeResult = await rpcUpsertTicketType({
    eventId,
    zoneId: zoneResult.zone_id,
    name: ticketName,
    price: priceRounded,
    ticketTypeId,
  });
  if (!typeResult.success) {
    return {
      ok: false,
      errorCode: typeResult.error_code ?? "TICKET_TYPE_UPSERT_FAILED",
    };
  }

  revalidatePath(`/${locale}/organizer/events/${eventId}`);
  revalidatePath(`/${locale}/organizer/events/${eventId}/tickets`);
  redirect(`/${locale}/organizer/events/${eventId}`);
}

/**
 * Organizer publish is intentionally disabled (P1 security).
 * Canonical lifecycle: draft → in_review (organizer) → approved → published (Super Admin).
 * This action never calls publish_event.
 */
export async function publishEventAction(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  void formData;
  return { ok: false, errorCode: "ORGANIZER_PUBLISH_FORBIDDEN" };
}
