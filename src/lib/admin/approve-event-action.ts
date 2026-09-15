"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminAuth } from "@/lib/admin/auth";
import { shouldUseDevAdminAuth } from "@/lib/admin/auth/should-use-dev-admin-auth";
import {
  parseApproveEventRpcResult,
  type ParsedApproveEventResult,
} from "@/lib/admin/approve-event-result";
import { isEventUuid } from "@/lib/admin/publish-event-result";
import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase/database";

type ApproveEventArgs = Database["public"]["Functions"]["approve_event"]["Args"];

const DEV_COOKIE_APPROVE_BLOCKED =
  "Dev cookie auth cannot call approve_event. Sign in with a Super Admin JWT.";

export type ApproveEventActionResult = ParsedApproveEventResult;

/**
 * Super Admin live approve. Dev cookie is fail-closed.
 * Success requires RPC success:true and matching event_id with status approved.
 */
export async function approveEventAction(eventId: string): Promise<ApproveEventActionResult> {
  if (shouldUseDevAdminAuth()) {
    return { ok: false, message: DEV_COOKIE_APPROVE_BLOCKED };
  }

  await getAdminAuth().requireSuperAdmin();

  if (!isSupabaseDataSource()) {
    return { ok: false, message: "approve_event failed: SUPABASE_REQUIRED" };
  }

  const trimmedId = eventId.trim();
  if (!isEventUuid(trimmedId)) {
    return { ok: false, message: "approve_event failed: EVENT_NOT_FOUND" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "approve_event failed: UNAUTHENTICATED" };
  }

  const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("is_super_admin");
  if (superAdminError || !isSuperAdmin) {
    return { ok: false, message: "approve_event failed: FORBIDDEN" };
  }

  const { data: eventRow, error: eventReadError } = await supabase
    .from("events")
    .select("id, status")
    .eq("id", trimmedId)
    .maybeSingle();

  if (eventReadError) {
    return { ok: false, message: `approve_event failed: ${eventReadError.message}` };
  }

  const row = eventRow as { id: string; status: string } | null;
  if (!row) {
    return { ok: false, message: "approve_event failed: EVENT_NOT_FOUND" };
  }

  if (String(row.status) !== "in_review") {
    return { ok: false, message: "approve_event failed: INVALID_TRANSITION" };
  }

  const rpcArgs: ApproveEventArgs = { p_event_id: trimmedId };
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "approve_event",
      args: ApproveEventArgs
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("approve_event", rpcArgs);

  if (error) {
    return { ok: false, message: `approve_event failed: ${error.message}` };
  }

  return parseApproveEventRpcResult(data, trimmedId);
}

export async function approveEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const returnBaseRaw = String(formData.get("returnBase") ?? "").trim();
  const returnBase =
    returnBaseRaw === "/tr/admin/events" ||
    returnBaseRaw === "/en/admin/events" ||
    returnBaseRaw === "/admin/review/events"
      ? returnBaseRaw
      : "/admin/review/events";
  const result = await approveEventAction(eventId);

  if (!result.ok) {
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approveError=${encodeURIComponent(result.message)}`
    );
  }

  revalidatePath("/admin/review/events");
  revalidatePath(`/admin/review/events/${result.eventId}`);
  revalidatePath("/tr/admin/events");
  revalidatePath("/en/admin/events");
  revalidatePath(`/tr/admin/events/${result.eventId}`);
  revalidatePath(`/en/admin/events/${result.eventId}`);
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${result.eventId}`);
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${result.eventId}`);

  redirect(
    `${returnBase}/${result.eventId}?approved=${encodeURIComponent(result.eventId)}`
  );
}
