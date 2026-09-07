"use server";

import { redirect } from "next/navigation";

import { requireOrganizer } from "@/lib/organizer/auth";
import { isVenueCategory } from "@/lib/organizer/data/venues";
import {
  isVenueUuid,
  parseOrganizerRpcJson,
  type StagingCreateVenueArgs,
  type StagingUpdateVenueArgs,
  type StagingVenueStatusArgs,
} from "@/lib/organizer/rpc";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

function redirectNew(error: string): never {
  redirect(`/organizer/venues/new?error=${encodeURIComponent(error)}`);
}

function redirectDetail(venueId: string, query: string): never {
  redirect(`/organizer/venues/${venueId}?${query}`);
}

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function parseOptionalNumber(
  formData: FormData,
  key: string
): { ok: true; value: number | null } | { ok: false } {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function parseOptionalInt(
  formData: FormData,
  key: string
): { ok: true; value: number | null } | { ok: false } {
  const parsed = parseOptionalNumber(formData, key);
  if (!parsed.ok) return parsed;
  if (parsed.value === null) return parsed;
  if (!Number.isInteger(parsed.value)) return { ok: false };
  return parsed;
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

async function callVenueRpc(
  fn: "create_venue_atomic" | "update_venue_atomic" | "deactivate_venue_atomic",
  args: StagingCreateVenueArgs | StagingUpdateVenueArgs | StagingVenueStatusArgs
): Promise<{ data: Json | null; error: { message: string } | null }> {
  const supabase = await createSupabaseServerClient();
  return (supabase.rpc as unknown as (
    name: typeof fn,
    params: typeof args
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(fn, args);
}

export async function createOrganizerVenueAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirectNew("config");
  }

  const session = await requireOrganizer();
  if (session.verificationStatus !== "approved") {
    redirectNew("not_eligible");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirectNew("name_required");

  const categoryRaw = String(formData.get("venue_category") ?? "").trim();
  let venueCategory: string | null = null;
  if (categoryRaw) {
    if (!isVenueCategory(categoryRaw)) redirectNew("invalid_venue_category");
    venueCategory = categoryRaw;
  }

  const districtId = optionalText(formData, "district_id");
  if (districtId && !isVenueUuid(districtId)) {
    redirectNew("invalid_district");
  }

  const coords = parseCoordinates(formData);
  if (!coords.ok) redirectNew(coords.error);

  const capacity = parseOptionalInt(formData, "capacity");
  if (!capacity.ok) redirectNew("invalid_capacity");
  if (capacity.value !== null && capacity.value <= 0) {
    redirectNew("invalid_capacity");
  }

  const rpcArgs: StagingCreateVenueArgs = {
    p_name: name,
    p_venue_category: venueCategory,
    p_address: optionalText(formData, "address"),
    p_city: optionalText(formData, "city"),
    p_region: optionalText(formData, "region"),
    p_district_id: districtId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_capacity: capacity.value,
    p_floor_plan_url: optionalText(formData, "floor_plan_url"),
  };

  const { data, error } = await callVenueRpc("create_venue_atomic", rpcArgs);
  if (error) {
    redirectNew("rpc_failed");
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success || !payload.venue_id || !isVenueUuid(payload.venue_id)) {
    redirectNew((payload.error_code ?? "create_failed").toLowerCase());
  }

  redirect(`/organizer/venues/${payload.venue_id}?created=1`);
}

export async function updateOrganizerVenueAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  await requireOrganizer();

  const venueId = String(formData.get("venue_id") ?? "").trim();
  if (!isVenueUuid(venueId)) {
    redirect("/organizer/venues");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirectDetail(venueId, "error=name_required");

  const categoryRaw = String(formData.get("venue_category") ?? "").trim();
  let venueCategory: string | null = null;
  if (categoryRaw) {
    if (!isVenueCategory(categoryRaw)) {
      redirectDetail(venueId, "error=invalid_venue_category");
    }
    venueCategory = categoryRaw;
  }

  const districtId = optionalText(formData, "district_id");
  if (districtId && !isVenueUuid(districtId)) {
    redirectDetail(venueId, "error=invalid_district");
  }

  const coords = parseCoordinates(formData);
  if (!coords.ok) redirectDetail(venueId, `error=${coords.error}`);

  const capacity = parseOptionalInt(formData, "capacity");
  if (!capacity.ok) redirectDetail(venueId, "error=invalid_capacity");
  if (capacity.value !== null && capacity.value <= 0) {
    redirectDetail(venueId, "error=invalid_capacity");
  }

  const rpcArgs: StagingUpdateVenueArgs = {
    p_venue_id: venueId,
    p_name: name,
    p_venue_category: venueCategory,
    p_address: optionalText(formData, "address"),
    p_city: optionalText(formData, "city"),
    p_region: optionalText(formData, "region"),
    p_district_id: districtId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_capacity: capacity.value,
    p_floor_plan_url: optionalText(formData, "floor_plan_url"),
  };

  const { data, error } = await callVenueRpc("update_venue_atomic", rpcArgs);
  if (error) {
    redirectDetail(venueId, "error=rpc_failed");
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    redirectDetail(venueId, `error=${(payload.error_code ?? "update_failed").toLowerCase()}`);
  }

  redirectDetail(venueId, "saved=1");
}

export async function deactivateOrganizerVenueAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }

  await requireOrganizer();

  const venueId = String(formData.get("venue_id") ?? "").trim();
  if (!isVenueUuid(venueId)) {
    redirect("/organizer/venues");
  }

  const { data, error } = await callVenueRpc("deactivate_venue_atomic", {
    p_venue_id: venueId,
  });
  if (error) {
    redirectDetail(venueId, "error=rpc_failed");
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    redirectDetail(
      venueId,
      `error=${(payload.error_code ?? "deactivate_failed").toLowerCase()}`
    );
  }

  redirectDetail(venueId, "deactivated=1");
}
