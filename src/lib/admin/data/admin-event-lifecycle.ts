/** Existing 034 RPCs: publish_event / postpone_event / reschedule_event. No create/unpublish/cancel. */

export const EVENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEventUuid(value: string | undefined | null): value is string {
  return Boolean(value && EVENT_UUID_RE.test(value.trim()));
}

export type EventLifecycleOk = {
  ok: true;
  eventId: string;
  noop?: boolean;
};

export type EventLifecycleFail = {
  ok: false;
  errorCode: string;
  message: string;
};

export type EventLifecycleResult = EventLifecycleOk | EventLifecycleFail;

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Super Admin Supabase session is required to change event status.",
  EVENT_NOT_FOUND: "Event was not found in the events table.",
  INVALID_STATE: "This status change is not allowed for the current event state.",
  OWNER_NOT_ELIGIBLE:
    "publish_event requires the event owner to be an approved venue_owner or organizer.",
  TICKET_ZONE_WITHOUT_TYPE: "Active ticket-based zones must have an active ticket type.",
  SEAT_ZONE_WITHOUT_PRICING: "Active seat-based zones must have seat pricing.",
  STARTS_AT_REQUIRED: "A new start time is required to reschedule.",
  INVALID_TIME_RANGE: "End time must be after start time.",
  NO_SUPABASE_ENV: "Supabase is not configured. Real event writes cannot run.",
  NO_SUPABASE_SESSION:
    "Dev cookie auth cannot call publish_event. Sign in as a Super Admin with Supabase.",
  NOT_SUPER_ADMIN: "Authenticated user is not a Super Admin.",
  RPC_ERROR: "Event lifecycle RPC failed.",
  INTAKE_NOT_LINKED_TO_EVENT:
    "Intake is not linked to an existing events.id. There is no create_event RPC, so publish cannot write a new row.",
  INTAKE_NOT_FOUND: "Intake not found.",
  INTAKE_NOT_APPROVED: "Intake must be APPROVED before publish_event can run.",
};

export function messageForLifecycleError(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.RPC_ERROR;
}

export function parseEventLifecycleRpc(
  data: unknown,
  rpcErrorMessage?: string | null
): EventLifecycleResult {
  if (rpcErrorMessage) {
    return { ok: false, errorCode: "RPC_ERROR", message: rpcErrorMessage };
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      errorCode: "RPC_ERROR",
      message: messageForLifecycleError("RPC_ERROR"),
    };
  }

  const row = data as Record<string, unknown>;
  if (row.success === true) {
    const eventId = typeof row.event_id === "string" ? row.event_id : undefined;
    if (!isEventUuid(eventId)) {
      return {
        ok: false,
        errorCode: "RPC_ERROR",
        message: "RPC returned success without a valid event_id.",
      };
    }
    return { ok: true, eventId, noop: row.noop === true };
  }

  const errorCode =
    typeof row.error_code === "string" && row.error_code.trim()
      ? row.error_code.trim()
      : "RPC_ERROR";

  return {
    ok: false,
    errorCode,
    message: messageForLifecycleError(errorCode),
  };
}

/** Intake mock IDs are not events.id. Only a real UUID can be sent to publish_event. */
export function resolveIntakePublishEventId(
  platformEventId: string | undefined
): string | null {
  return isEventUuid(platformEventId) ? platformEventId.trim() : null;
}

export function canPublishEventStatus(status: string): boolean {
  return status === "draft";
}

export function canPostponeEventStatus(status: string): boolean {
  return status === "published";
}

export function canRescheduleEventStatus(status: string): boolean {
  return status === "published" || status === "postponed";
}
