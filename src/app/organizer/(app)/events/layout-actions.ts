"use server";

import { redirect } from "next/navigation";

import { requireOrganizer } from "@/lib/organizer/auth";
import { requireOwnedDraftEvent } from "@/lib/organizer/data/event-metadata";
import { getOrganizerEvent } from "@/lib/organizer/data/events";
import {
  isEventUuid,
  isVenueUuid,
  parseOrganizerRpcJson,
} from "@/lib/organizer/rpc";
import { isPackageSaleCategory } from "@/lib/reservation/capacity";
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

async function gateDraftLayout(
  eventId: string,
  ownerId: string
): Promise<void> {
  const gate = await requireOwnedDraftEvent(eventId, ownerId);
  if (!gate.ok) {
    redirectLayout(
      eventId,
      `layout_error=${gate.reason === "not_draft" ? "not_draft" : "forbidden"}`
    );
  }
}

/**
 * Enable / update event_tables — draft-only, mirrors ticket commerce gate.
 * Published events: rejected (not_draft). Mutations via upsert_event_table_atomic.
 */
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

  await gateDraftLayout(eventId, session.userId);

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

/**
 * Create or edit package via upsert_table_package_atomic.
 * Price edits update catalog only — order_items keep snapshot prices.
 */
export async function upsertEventTablePackageAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }
  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const eventTableId = String(formData.get("event_table_id") ?? "").trim();
  const packageIdRaw = String(formData.get("package_id") ?? "").trim();
  const packageId =
    packageIdRaw && isUuid(packageIdRaw) ? packageIdRaw : null;
  const name = String(formData.get("name") ?? "").trim();
  const basePrice = Number(String(formData.get("base_price") ?? "").trim());
  const depositRaw = String(formData.get("deposit_amount") ?? "").trim();
  const saleCategory = String(formData.get("sale_category") ?? "table").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActiveRaw = String(formData.get("is_active") ?? "true").trim();
  const isActive = isActiveRaw !== "false" && isActiveRaw !== "0";

  if (!isEventUuid(eventId) || !isUuid(eventTableId)) {
    redirect("/organizer");
  }

  await gateDraftLayout(eventId, session.userId);

  const event = await getOrganizerEvent(eventId, session.userId);
  if (!event || !isVenueUuid(event.venueId)) {
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
    p_is_active: isActive,
    p_package_id: packageId,
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
  redirectLayout(
    eventId,
    packageId ? "layout=package_updated" : "layout=package_saved"
  );
}

/**
 * Soft deactivate: set is_active=false via upsert (works even when package has
 * historical reservations). New checkout filters is_active=true only.
 * Prefer this over deactivate_table_package_atomic which returns PACKAGE_IN_USE.
 */
export async function setEventTablePackageActiveAction(
  formData: FormData
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/organizer/login?error=config");
  }
  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const packageId = String(formData.get("package_id") ?? "").trim();
  const eventTableId = String(formData.get("event_table_id") ?? "").trim();
  const activeRaw = String(formData.get("is_active") ?? "").trim();
  const isActive = activeRaw === "true" || activeRaw === "1";

  if (!isEventUuid(eventId) || !isUuid(packageId) || !isUuid(eventTableId)) {
    redirect("/organizer");
  }

  await gateDraftLayout(eventId, session.userId);

  const supabase = await createSupabaseServerClient();
  type PackageCatalogRow = {
    id: string;
    event_id: string;
    event_table_id: string;
    name: string;
    base_price: number | string;
    deposit_amount: number | string | null;
    sale_category: string;
    description: string | null;
    is_active: boolean;
  };
  type PackageQuery = {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => {
        eq: (
          col: string,
          val: string
        ) => {
          maybeSingle: () => Promise<{
            data: PackageCatalogRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const from = supabase.from.bind(supabase) as unknown as (
    t: string
  ) => PackageQuery;
  const { data: existing, error: loadErr } = await from("table_packages")
    .select(
      "id, event_id, event_table_id, name, base_price, deposit_amount, sale_category, description, is_active"
    )
    .eq("id", packageId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (loadErr || !existing) {
    redirectLayout(eventId, "layout_error=package_not_found");
  }

  const row = existing;

  if (row.event_table_id !== eventTableId) {
    redirectLayout(eventId, "layout_error=package_not_found");
  }

  const basePrice = Number(row.base_price);
  const depositAmount =
    row.deposit_amount == null ? null : Number(row.deposit_amount);

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
    p_name: row.name,
    p_base_price: basePrice,
    p_deposit_amount: depositAmount,
    p_sale_category: row.sale_category,
    p_description: row.description,
    p_is_active: isActive,
    p_package_id: packageId,
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
  redirectLayout(
    eventId,
    isActive ? "layout=package_reactivated" : "layout=package_deactivated"
  );
}
