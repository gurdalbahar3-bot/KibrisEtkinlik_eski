import type { PublishChecklistItem } from "@/lib/admin/publishing/publish-checklist";
import type { DbPublishEventResult } from "@/types/supabase/database";

/** Default Super Admin publish button: approved | unpublished. Draft emergency is not this path. */
export const DEFAULT_PUBLISHABLE_EVENT_STATUSES = ["approved", "unpublished"] as const;

export type DefaultPublishableEventStatus =
  (typeof DEFAULT_PUBLISHABLE_EVENT_STATUSES)[number];

export const DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE =
  "Dev cookie auth cannot call publish_event. Sign in with a Super Admin JWT.";

export const MOCK_PUBLISH_DISABLED_MESSAGE =
  "Mock publishing is not a live publish path. Super Admin publish uses publish_event RPC.";

const EVENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEventUuid(value: string): boolean {
  return EVENT_UUID_RE.test(value);
}

export function isDefaultPublishableStatus(
  status: string
): status is DefaultPublishableEventStatus {
  return (DEFAULT_PUBLISHABLE_EVENT_STATUSES as readonly string[]).includes(status);
}

export type ParsedPublishEventResult =
  | { ok: true; eventId: string }
  | { ok: false; message: string; errorCode?: string };

/**
 * Success only when the RPC payload has success:true AND a real event UUID
 * matching the requested id. Never treat mock ids or missing ids as success.
 */
export function parsePublishEventRpcResult(
  data: unknown,
  requestedEventId: string
): ParsedPublishEventResult {
  const payload = data as DbPublishEventResult | null;
  if (!payload || payload.success !== true) {
    const errorCode = payload?.error_code ?? "UNKNOWN";
    return {
      ok: false,
      message: `publish_event failed: ${errorCode}`,
      errorCode,
    };
  }

  const eventId = typeof payload.event_id === "string" ? payload.event_id.trim() : "";
  if (!isEventUuid(eventId)) {
    return {
      ok: false,
      message: "publish_event failed: MISSING_EVENT_ID",
      errorCode: "MISSING_EVENT_ID",
    };
  }

  if (eventId !== requestedEventId) {
    return {
      ok: false,
      message: "publish_event failed: EVENT_ID_MISMATCH",
      errorCode: "EVENT_ID_MISMATCH",
    };
  }

  return { ok: true, eventId };
}

export function shouldShowPublishSuccess(options: {
  publishedQuery: string | undefined;
  eventId: string;
  eventStatus: string;
  publishErrorQuery: string | undefined;
}): boolean {
  if (options.publishErrorQuery?.trim()) {
    return false;
  }
  if (options.eventStatus !== "published") {
    return false;
  }
  const publishedId = options.publishedQuery?.trim() ?? "";
  return isEventUuid(publishedId) && publishedId === options.eventId;
}

export function publishErrorFromQuery(publishErrorQuery: string | undefined): string | undefined {
  const trimmed = publishErrorQuery?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolvePublishReturnPath(raw: string, eventId: string): string {
  const fallback = isEventUuid(eventId) ? `/admin/events/${eventId}` : "/admin/publishing";
  const allowed = new Set([
    "/admin/publishing",
    "/admin/events",
    ...(isEventUuid(eventId)
      ? [`/admin/publishing/${eventId}`, `/admin/events/${eventId}`]
      : []),
  ]);
  return allowed.has(raw) ? raw : fallback;
}

export function buildDefaultEventPublishChecklist(event: {
  title: string;
  status: string;
  venueName: string;
  startsAt: string;
  category: string;
  district: string;
}): PublishChecklistItem[] {
  return [
    {
      id: "publishableStatus",
      labelKey: "checkPublishableStatus",
      passed: isDefaultPublishableStatus(event.status),
    },
    { id: "title", labelKey: "checkTitle", passed: Boolean(event.title?.trim()) },
    { id: "date", labelKey: "checkDate", passed: Boolean(event.startsAt?.trim()) },
    { id: "district", labelKey: "checkDistrict", passed: Boolean(event.district) },
    { id: "venue", labelKey: "checkVenue", passed: Boolean(event.venueName?.trim()) },
    { id: "category", labelKey: "checkCategory", passed: Boolean(event.category) },
  ];
}
