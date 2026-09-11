import "server-only";

import {
  evaluateCheckInPreflight,
  mapUseQrErrorToUiCode,
} from "@/lib/tickets/issuance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

export type OrganizerCheckInResult = {
  success: boolean;
  errorCode: string | null;
  scanResult: string | null;
  qrCodeId: string | null;
  ticketId: string | null;
};

type QrLookupRow = {
  id: string;
  token: string;
  status: string;
  event_id: string;
  entity_type: string;
  entity_id: string;
};

/**
 * Server-side check-in via use_qr_atomic.
 * Customer sessions cannot call this meaningfully (can_scan_event required).
 */
export async function scanEventTicketQr(input: {
  eventId: string;
  token: string;
  deviceId?: string | null;
}): Promise<OrganizerCheckInResult> {
  const token = input.token.trim();
  if (!token) {
    return {
      success: false,
      errorCode: "INVALID",
      scanResult: null,
      qrCodeId: null,
      ticketId: null,
    };
  }

  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: qrRaw } = await (supabase as any)
    .from("qr_codes")
    .select("id, token, status, event_id, entity_type, entity_id")
    .eq("token", token)
    .maybeSingle();

  const qr = qrRaw as QrLookupRow | null;

  let ticketStatus: string | null = null;
  if (qr?.entity_type === "ticket" && qr.entity_id) {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("status")
      .eq("id", qr.entity_id)
      .maybeSingle();
    ticketStatus = (ticket as { status?: string } | null)?.status ?? null;
  }

  const preflight = evaluateCheckInPreflight({
    selectedEventId: input.eventId,
    qrEventId: qr?.event_id ?? null,
    qrStatus: qr?.status ?? null,
    ticketStatus,
    entityType: qr?.entity_type ?? null,
  });

  // Already-used / revoked still go through use_qr_atomic so qr_scan_logs is written.
  const auditViaRpc =
    !preflight.ok &&
    (preflight.errorCode === "ALREADY_USED" ||
      preflight.errorCode === "REVOKED");

  if (!preflight.ok && !auditViaRpc) {
    return {
      success: false,
      errorCode: preflight.errorCode,
      scanResult: null,
      qrCodeId: qr?.id ?? null,
      ticketId: qr?.entity_type === "ticket" ? qr.entity_id : null,
    };
  }

  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "use_qr_atomic",
      args: { p_token: string; p_device_id?: string | null }
    ) => Promise<{ data: Json | null; error: { message: string } | null }>
  )("use_qr_atomic", {
    p_token: token,
    p_device_id: input.deviceId ?? null,
  });

  if (error) {
    return {
      success: false,
      errorCode: "INVALID",
      scanResult: null,
      qrCodeId: qr?.id ?? null,
      ticketId: qr?.entity_id ?? null,
    };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  const success = body.success === true;
  const rawError =
    typeof body.error_code === "string" ? body.error_code : null;
  const scanResult =
    typeof body.scan_result === "string" ? body.scan_result : null;
  const qrCodeId =
    typeof body.qr_code_id === "string" ? body.qr_code_id : qr?.id ?? null;

  return {
    success,
    errorCode: success ? null : mapUseQrErrorToUiCode(rawError),
    scanResult,
    qrCodeId,
    ticketId: qr?.entity_id ?? null,
  };
}

export function parseUseQrJson(data: Json | null): {
  success: boolean;
  errorCode: string | null;
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, errorCode: "INVALID" };
  }
  const row = data as Record<string, unknown>;
  if (row.success === true) return { success: true, errorCode: null };
  const code = typeof row.error_code === "string" ? row.error_code : "INVALID";
  return { success: false, errorCode: mapUseQrErrorToUiCode(code) };
}
