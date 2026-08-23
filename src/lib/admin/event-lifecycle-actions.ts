"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  callPostponeEvent,
  callPublishEvent,
  callRescheduleEvent,
} from "@/lib/admin/data/admin-event-lifecycle-rpc";
import {
  canPostponeEventStatus,
  canPublishEventStatus,
  canRescheduleEventStatus,
  isEventUuid,
  messageForLifecycleError,
  type EventLifecycleResult,
} from "@/lib/admin/data/admin-event-lifecycle";
import { getAdminPublicEventById } from "@/lib/admin/data/admin-events-read";

function redirectWithLifecycleError(eventId: string, result: EventLifecycleResult): never {
  const code = result.ok ? "RPC_ERROR" : result.errorCode;
  redirect(`/admin/events/${eventId}?error=${encodeURIComponent(code)}`);
}

function revalidateAfterEventWrite(eventId: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/", "layout");
}

export async function publishAdminEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/admin/events?error=EVENT_NOT_FOUND");
  }

  const event = await getAdminPublicEventById(eventId);
  if (!event) {
    redirectWithLifecycleError(eventId, {
      ok: false,
      errorCode: "EVENT_NOT_FOUND",
      message: messageForLifecycleError("EVENT_NOT_FOUND"),
    });
  }

  if (!canPublishEventStatus(event.status)) {
    redirectWithLifecycleError(eventId, {
      ok: false,
      errorCode: "INVALID_STATE",
      message: messageForLifecycleError("INVALID_STATE"),
    });
  }

  const result = await callPublishEvent(eventId);
  if (!result.ok) {
    redirectWithLifecycleError(eventId, result);
  }

  revalidateAfterEventWrite(eventId);
  redirect(`/admin/events/${eventId}?published=1`);
}

export async function postponeAdminEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/admin/events?error=EVENT_NOT_FOUND");
  }

  const event = await getAdminPublicEventById(eventId);
  if (!event || !canPostponeEventStatus(event.status)) {
    redirectWithLifecycleError(eventId, {
      ok: false,
      errorCode: event ? "INVALID_STATE" : "EVENT_NOT_FOUND",
      message: messageForLifecycleError(event ? "INVALID_STATE" : "EVENT_NOT_FOUND"),
    });
  }

  const result = await callPostponeEvent(eventId, reason || undefined);
  if (!result.ok) {
    redirectWithLifecycleError(eventId, result);
  }

  revalidateAfterEventWrite(eventId);
  redirect(`/admin/events/${eventId}?postponed=1`);
}

export async function rescheduleAdminEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  if (!isEventUuid(eventId)) {
    redirect("/admin/events?error=EVENT_NOT_FOUND");
  }

  const event = await getAdminPublicEventById(eventId);
  if (!event || !canRescheduleEventStatus(event.status)) {
    redirectWithLifecycleError(eventId, {
      ok: false,
      errorCode: event ? "INVALID_STATE" : "EVENT_NOT_FOUND",
      message: messageForLifecycleError(event ? "INVALID_STATE" : "EVENT_NOT_FOUND"),
    });
  }

  if (!startsAtRaw) {
    redirectWithLifecycleError(eventId, {
      ok: false,
      errorCode: "STARTS_AT_REQUIRED",
      message: messageForLifecycleError("STARTS_AT_REQUIRED"),
    });
  }

  const startsAt = new Date(startsAtRaw).toISOString();
  const endsAt = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;
  if (Number.isNaN(Date.parse(startsAt)) || (endsAt && Number.isNaN(Date.parse(endsAt)))) {
    redirectWithLifecycleError(eventId, {
      ok: false,
      errorCode: "INVALID_TIME_RANGE",
      message: messageForLifecycleError("INVALID_TIME_RANGE"),
    });
  }

  const result = await callRescheduleEvent(eventId, startsAt, endsAt);
  if (!result.ok) {
    redirectWithLifecycleError(eventId, result);
  }

  revalidateAfterEventWrite(eventId);
  redirect(`/admin/events/${eventId}?rescheduled=1`);
}
