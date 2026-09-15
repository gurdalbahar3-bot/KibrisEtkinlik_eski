"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminAuth } from "@/lib/admin/auth";
import { shouldUseDevAdminAuth } from "@/lib/admin/auth/should-use-dev-admin-auth";
import {
  DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE,
  isDefaultPublishableStatus,
  isEventUuid,
  parsePublishEventRpcResult,
  resolvePublishReturnPath,
  type ParsedPublishEventResult,
} from "@/lib/admin/publish-event-result";
import { isSupabaseDataSource } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase/database";

type PublishEventArgs = Database["public"]["Functions"]["publish_event"]["Args"];

export type PublishEventActionResult = ParsedPublishEventResult;

/**
 * Super Admin live publish. Dev cookie is fail-closed and never reaches publish_event.
 * Success requires RPC success:true and a real event_id. No mock fallback.
 */
export async function publishEventAction(eventId: string): Promise<PublishEventActionResult> {
  if (shouldUseDevAdminAuth()) {
    return { ok: false, message: DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE };
  }

  await getAdminAuth().requireSuperAdmin();

  if (!isSupabaseDataSource()) {
    return { ok: false, message: "publish_event failed: SUPABASE_REQUIRED" };
  }

  const trimmedId = eventId.trim();
  if (!isEventUuid(trimmedId)) {
    return { ok: false, message: "publish_event failed: EVENT_NOT_FOUND" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "publish_event failed: UNAUTHENTICATED" };
  }

  const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("is_super_admin");
  if (superAdminError || !isSuperAdmin) {
    return { ok: false, message: "publish_event failed: FORBIDDEN" };
  }

  const { data: eventRow, error: eventReadError } = await supabase
    .from("events")
    .select("id, status")
    .eq("id", trimmedId)
    .maybeSingle();

  if (eventReadError) {
    return { ok: false, message: `publish_event failed: ${eventReadError.message}` };
  }

  const row = eventRow as { id: string; status: string } | null;
  if (!row) {
    return { ok: false, message: "publish_event failed: EVENT_NOT_FOUND" };
  }

  // Default Super Admin button: approved | unpublished only. Do not use this
  // action as the emergency draft publish path (RPC still allows that separately).
  if (!isDefaultPublishableStatus(row.status)) {
    return { ok: false, message: "publish_event failed: INVALID_STATE" };
  }

  const rpcArgs: PublishEventArgs = { p_event_id: trimmedId };
  // Hand-maintained Database types do not satisfy supabase-js RPC generic inference
  // (Args collapses to never). The payload is still checked via PublishEventArgs.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "publish_event",
      args: PublishEventArgs
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("publish_event", rpcArgs);

  if (error) {
    return { ok: false, message: `publish_event failed: ${error.message}` };
  }

  return parsePublishEventRpcResult(data, trimmedId);
}

export async function publishEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const returnPath = resolvePublishReturnPath(String(formData.get("returnPath") ?? ""), eventId);
  const result = await publishEventAction(eventId);

  if (!result.ok) {
    redirect(`${returnPath}?publishError=${encodeURIComponent(result.message)}`);
  }

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${result.eventId}`);
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${result.eventId}`);
  revalidatePath("/tr", "layout");
  revalidatePath("/en", "layout");

  redirect(`/admin/events/${result.eventId}?published=${encodeURIComponent(result.eventId)}`);
}
