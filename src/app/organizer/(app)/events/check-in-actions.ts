"use server";

import { requireOrganizer } from "@/lib/organizer/auth";
import { getOrganizerEvent } from "@/lib/organizer/data/events";
import { scanEventTicketQr } from "@/lib/organizer/data/check-in";
import { isEventUuid } from "@/lib/organizer/rpc";

export type CheckInActionState = {
  success: boolean;
  errorCode: string | null;
  scanResult: string | null;
  ticketId: string | null;
};

export async function organizerCheckInScanAction(
  _prev: CheckInActionState | null,
  formData: FormData
): Promise<CheckInActionState> {
  const session = await requireOrganizer();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const deviceId = String(formData.get("device_id") ?? "").trim() || null;

  if (!isEventUuid(eventId)) {
    return {
      success: false,
      errorCode: "INVALID",
      scanResult: null,
      ticketId: null,
    };
  }

  const event = await getOrganizerEvent(eventId, session.userId);
  if (!event) {
    return {
      success: false,
      errorCode: "FORBIDDEN",
      scanResult: null,
      ticketId: null,
    };
  }

  const result = await scanEventTicketQr({
    eventId,
    token,
    deviceId,
  });

  return {
    success: result.success,
    errorCode: result.errorCode,
    scanResult: result.scanResult,
    ticketId: result.ticketId,
  };
}
