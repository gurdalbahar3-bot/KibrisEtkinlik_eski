"use server";

import { redirect } from "next/navigation";

import { requireOrganizer } from "@/lib/organizer/auth";
import { getOrganizerVenue } from "@/lib/organizer/data/venues";
import {
  isVenueUuid,
  parseOrganizerRpcJson,
} from "@/lib/organizer/rpc";
import {
  VENUE_AREA_TYPES,
  VENUE_TABLE_TYPES,
} from "@/lib/reservation/capacity";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

function redirectLayout(venueId: string, query: string): never {
  redirect(`/organizer/venues/${venueId}?${query}`);
}

async function callLayoutBatch(
  venueId: string,
  payload: {
    p_areas?: Json[];
    p_tables?: Json[];
  }
): Promise<{ data: Json | null; error: { message: string } | null }> {
  const supabase = await createSupabaseServerClient();
  return (
    supabase.rpc as unknown as (
      fn: "save_venue_layout_batch_atomic",
      args: {
        p_venue_id: string;
        p_areas?: Json[];
        p_tables?: Json[];
      }
    ) => Promise<{ data: Json | null; error: { message: string } | null }>
  )("save_venue_layout_batch_atomic", {
    p_venue_id: venueId,
    p_areas: payload.p_areas,
    p_tables: payload.p_tables,
  });
}

export async function saveVenueAreaAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }
  await requireOrganizer();
  const venueId = String(formData.get("venue_id") ?? "").trim();
  if (!isVenueUuid(venueId)) {
    redirect("/organizer/venues");
  }
  const venue = await getOrganizerVenue(venueId);
  if (!venue) {
    redirectLayout(venueId, "layout_error=forbidden");
  }

  const name = String(formData.get("name") ?? "").trim();
  const areaType = String(formData.get("area_type") ?? "hall").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? Number.parseInt(capacityRaw, 10) : null;

  if (!name) {
    redirectLayout(venueId, "layout_error=name_required");
  }
  if (!(VENUE_AREA_TYPES as readonly string[]).includes(areaType)) {
    redirectLayout(venueId, "layout_error=invalid_area_type");
  }
  if (capacity != null && (!Number.isFinite(capacity) || capacity <= 0)) {
    redirectLayout(venueId, "layout_error=invalid_capacity");
  }

  const { data, error } = await callLayoutBatch(venueId, {
    p_areas: [
      {
        name,
        area_type: areaType,
        capacity,
        sort_order: 0,
      },
    ],
  });
  if (error) {
    redirectLayout(venueId, "layout_error=rpc_failed");
  }
  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    redirectLayout(
      venueId,
      `layout_error=${(payload.error_code ?? "save_failed").toLowerCase()}`
    );
  }
  redirectLayout(venueId, "layout=area_saved");
}

export async function saveVenueTableAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }
  await requireOrganizer();
  const venueId = String(formData.get("venue_id") ?? "").trim();
  if (!isVenueUuid(venueId)) {
    redirect("/organizer/venues");
  }
  const venue = await getOrganizerVenue(venueId);
  if (!venue) {
    redirectLayout(venueId, "layout_error=forbidden");
  }

  const tableNumber = String(formData.get("table_number") ?? "").trim();
  const capacity = Number.parseInt(String(formData.get("capacity") ?? ""), 10);
  const tableType = String(formData.get("table_type") ?? "standard").trim();
  const areaId = String(formData.get("area_id") ?? "").trim();
  const posXRaw = String(formData.get("position_x") ?? "").trim();
  const posYRaw = String(formData.get("position_y") ?? "").trim();

  if (!tableNumber) {
    redirectLayout(venueId, "layout_error=table_number_required");
  }
  if (!Number.isFinite(capacity) || capacity <= 0) {
    redirectLayout(venueId, "layout_error=invalid_capacity");
  }
  if (!(VENUE_TABLE_TYPES as readonly string[]).includes(tableType)) {
    redirectLayout(venueId, "layout_error=invalid_table_type");
  }

  const item: Record<string, string | number | null> = {
    table_number: tableNumber,
    capacity,
    table_type: tableType,
    area_id: areaId || null,
    position_x: posXRaw ? Number(posXRaw) : 40,
    position_y: posYRaw ? Number(posYRaw) : 40,
    width: 56,
    depth: 56,
  };

  const { data, error } = await callLayoutBatch(venueId, {
    p_tables: [item],
  });
  if (error) {
    redirectLayout(venueId, "layout_error=rpc_failed");
  }
  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    redirectLayout(
      venueId,
      `layout_error=${(payload.error_code ?? "save_failed").toLowerCase()}`
    );
  }
  redirectLayout(venueId, "layout=table_saved");
}
