import { getAdminAuth } from "@/lib/admin/auth";
import {
  messageForLifecycleError,
  parseEventLifecycleRpc,
  type EventLifecycleResult,
} from "@/lib/admin/data/admin-event-lifecycle";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase/database";

type LifecycleFn = "publish_event" | "postpone_event" | "reschedule_event";

async function callLifecycleRpc(
  supabase: SupabaseClient<Database>,
  fn: LifecycleFn,
  args: Record<string, unknown>
): Promise<EventLifecycleResult> {
  const { data, error } = await (
    supabase as SupabaseClient
  ).rpc(fn, args);
  return parseEventLifecycleRpc(data, error?.message);
}

export type SuperAdminWriteClient =
  | { ok: true; supabase: SupabaseClient<Database> }
  | EventLifecycleResult & { ok: false };

export async function getSuperAdminWriteClient(): Promise<SuperAdminWriteClient> {
  await getAdminAuth().requireSuperAdmin();

  if (!getSupabasePublicEnv()) {
    return {
      ok: false,
      errorCode: "NO_SUPABASE_ENV",
      message: messageForLifecycleError("NO_SUPABASE_ENV"),
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      errorCode: "NO_SUPABASE_SESSION",
      message: messageForLifecycleError("NO_SUPABASE_SESSION"),
    };
  }

  const { data: isSuperAdmin, error } = await supabase.rpc("is_super_admin");
  if (error || !isSuperAdmin) {
    return {
      ok: false,
      errorCode: "NOT_SUPER_ADMIN",
      message: messageForLifecycleError("NOT_SUPER_ADMIN"),
    };
  }

  return { ok: true, supabase };
}

export async function canSuperAdminWriteEvents(): Promise<boolean> {
  const client = await getSuperAdminWriteClient();
  return client.ok;
}

export async function callPublishEvent(eventId: string): Promise<EventLifecycleResult> {
  const client = await getSuperAdminWriteClient();
  if (!client.ok) return client;

  return callLifecycleRpc(client.supabase, "publish_event", {
    p_event_id: eventId,
  });
}

export async function callPostponeEvent(
  eventId: string,
  reason?: string
): Promise<EventLifecycleResult> {
  const client = await getSuperAdminWriteClient();
  if (!client.ok) return client;

  return callLifecycleRpc(client.supabase, "postpone_event", {
    p_event_id: eventId,
    p_reason: reason?.trim() || null,
  });
}

export async function callRescheduleEvent(
  eventId: string,
  startsAt: string,
  endsAt?: string | null
): Promise<EventLifecycleResult> {
  const client = await getSuperAdminWriteClient();
  if (!client.ok) return client;

  return callLifecycleRpc(client.supabase, "reschedule_event", {
    p_event_id: eventId,
    p_starts_at: startsAt,
    p_ends_at: endsAt ?? null,
  });
}
