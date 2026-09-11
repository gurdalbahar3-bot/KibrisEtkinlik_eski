"use server";

import { redirect } from "next/navigation";

import { requireOrganizer } from "@/lib/organizer/auth";
import { getOrganizerEvent } from "@/lib/organizer/data/events";
import {
  isEventUuid,
  isVenueUuid,
  parseOrganizerRpcJson,
} from "@/lib/organizer/rpc";
import {
  isPackageSaleCategory,
} from "@/lib/reservation/capacity";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectLayout(eventId: string, query: string): never {
  redirect(`/organizer/events/${eventId}?${query}`);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function enableEventTableAction(formData: FormData): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }
  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const tableId = String(formData.get("table_id") ?? "").trim();
  const maxGuestsRaw = String(formData.get("max_guests") ?? "").trim();
  const sellableRaw = String(formData.get("is_sellable") ?? "true").trim();

  if (!isEventUuid(eventId) || !isUuid(tableId)) {
    redirect("/organizer");
  }

  const event = await getOrganizerEvent(eventId, session.userId);
  if (!event) {
    redirectLayout(eventId, "layout_error=forbidden");
  }

  const maxGuests = maxGuestsRaw
    ? Number.parseInt(maxGuestsRaw, 10)
    : null;
  if (
    maxGuests != null &&
    (!Number.isFinite(maxGuests) || maxGuests <= 0)
  ) {
    redirectLayout(eventId, "layout_error=invalid_max_guests");
  }

  const isSellable = sellableRaw !== "false" && sellableRaw !== "0";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "upsert_event_table_atomic",
      args: {
        p_event_id: string;
        p_table_id: string;
        p_is_sellable?: boolean;
        p_max_guests?: number | null;
      }
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("upsert_event_table_atomic", {
    p_event_id: eventId,
    p_table_id: tableId,
    p_is_sellable: isSellable,
    p_max_guests: maxGuests,
  });

  if (error) {
    redirectLayout(eventId, "layout_error=rpc_failed");
  }
  const payload = parseOrganizerRpcJson(
    data as Parameters<typeof parseOrganizerRpcJson>[0]
  );
  if (!payload.success) {
    redirectLayout(
      eventId,
      `layout_error=${(payload.error_code ?? "save_failed").toLowerCase()}`
    );
  }
  redirectLayout(eventId, "layout=table_enabled");
}

export async function upsertEventTablePackageAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }
  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const eventTableId = String(formData.get("event_table_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const basePrice = Number(String(formData.get("base_price") ?? "").trim());
  const depositRaw = String(formData.get("deposit_amount") ?? "").trim();
  const saleCategory = String(formData.get("sale_category") ?? "table").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!isEventUuid(eventId) || !isUuid(eventTableId)) {
    redirect("/organizer");
  }

  const event = await getOrganizerEvent(eventId, session.userId);
  if (!event) {
    redirectLayout(eventId, "layout_error=forbidden");
  }
  if (!isVenueUuid(event.venueId)) {
    redirectLayout(eventId, "layout_error=forbidden");
  }

  if (!name) {
    redirectLayout(eventId, "layout_error=name_required");
  }
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    redirectLayout(eventId, "layout_error=invalid_price");
  }
  if (!isPackageSaleCategory(saleCategory)) {
    redirectLayout(eventId, "layout_error=invalid_sale_category");
  }

  const depositAmount = depositRaw ? Number(depositRaw) : null;
  if (
    depositAmount != null &&
    (!Number.isFinite(depositAmount) ||
      depositAmount < 0 ||
      depositAmount > basePrice)
  ) {
    redirectLayout(eventId, "layout_error=invalid_deposit");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "upsert_table_package_atomic",
      args: {
        p_event_id: string;
        p_event_table_id: string;
        p_name: string;
        p_base_price: number;
        p_deposit_amount?: number | null;
        p_sale_category?: string;
        p_description?: string | null;
        p_is_active?: boolean;
        p_package_id?: string | null;
      }
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("upsert_table_package_atomic", {
    p_event_id: eventId,
    p_event_table_id: eventTableId,
    p_name: name,
    p_base_price: basePrice,
    p_deposit_amount: depositAmount,
    p_sale_category: saleCategory,
    p_description: description || null,
    p_is_active: true,
    p_package_id: null,
  });

  if (error) {
    redirectLayout(eventId, "layout_error=rpc_failed");
  }
  const payload = parseOrganizerRpcJson(
    data as Parameters<typeof parseOrganizerRpcJson>[0]
  );
  if (!payload.success) {
    redirectLayout(
      eventId,
      `layout_error=${(payload.error_code ?? "save_failed").toLowerCase()}`
    );
  }
  redirectLayout(eventId, "layout=package_saved");
}
