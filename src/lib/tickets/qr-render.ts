import "server-only";

import QRCode from "qrcode";

import { buildTicketQrPayload, isSecureQrToken } from "@/lib/tickets/issuance";

/**
 * Server-side QR image for display only. Payload is the opaque token — never PII.
 */
export async function renderTicketQrDataUrl(token: string): Promise<string | null> {
  const payload = buildTicketQrPayload(token);
  if (!isSecureQrToken(payload)) {
    return null;
  }
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}
