import type { DbApproveEventResult } from "@/types/supabase/database";
import { isEventUuid } from "@/lib/admin/publish-event-result";

export type ParsedApproveEventResult =
  | { ok: true; eventId: string }
  | { ok: false; message: string; errorCode?: string };

const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  UNAUTHENTICATED: "approve_event failed: UNAUTHENTICATED",
  FORBIDDEN: "approve_event failed: FORBIDDEN",
  EVENT_NOT_FOUND: "approve_event failed: EVENT_NOT_FOUND",
  INVALID_TRANSITION: "approve_event failed: INVALID_TRANSITION",
  UNKNOWN: "approve_event failed: UNKNOWN",
};

export function parseApproveEventRpcResult(
  data: unknown,
  requestedEventId: string
): ParsedApproveEventResult {
  const payload = data as DbApproveEventResult | null;
  if (!payload || payload.success !== true) {
    const errorCode = payload?.error_code ?? "UNKNOWN";
    return {
      ok: false,
      message: ERROR_MESSAGE_BY_CODE[errorCode] ?? `approve_event failed: ${errorCode}`,
      errorCode,
    };
  }

  const eventId = typeof payload.event_id === "string" ? payload.event_id.trim() : "";
  if (!isEventUuid(eventId)) {
    return {
      ok: false,
      message: "approve_event failed: MISSING_EVENT_ID",
      errorCode: "MISSING_EVENT_ID",
    };
  }

  if (eventId !== requestedEventId) {
    return {
      ok: false,
      message: "approve_event failed: EVENT_ID_MISMATCH",
      errorCode: "EVENT_ID_MISMATCH",
    };
  }

  if (payload.status && payload.status !== "approved") {
    return {
      ok: false,
      message: "approve_event failed: UNEXPECTED_STATUS",
      errorCode: "UNEXPECTED_STATUS",
    };
  }

  return { ok: true, eventId };
}

export function approveErrorFromQuery(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
