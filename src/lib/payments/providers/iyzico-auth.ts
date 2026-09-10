/**
 * IYZWSv2 authorization helpers (pure crypto).
 * Secrets are passed as arguments — never log them.
 * Env loading lives in the server-only iyzico provider wrapper.
 *
 * Spec: HMAC-SHA256(randomKey + uriPath + requestBodyJson, secretKey)
 * Auth header: IYZWSv2 + " " + base64("apiKey:"+apiKey+"&randomKey:"+randomKey+"&signature:"+hex)
 * @see https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type IyzicoAuthInput = {
  apiKey: string;
  secretKey: string;
  /** Same value must be sent as `x-iyzi-rnd` header. */
  randomKey: string;
  /** Absolute path only, e.g. `/payment/iyzipos/checkoutform/initialize/auth/ecom` */
  uriPath: string;
  /**
   * Exact JSON body string used for the HTTP request (or empty string when no body).
   * Must be byte-identical to the wire body — stringify once and reuse.
   */
  requestBodyJson: string;
};

export type IyzicoAuthHeaders = {
  Authorization: string;
  "x-iyzi-rnd": string;
  "Content-Type": "application/json";
};

/** Redact known secret substrings from messages (never echo keys). */
export function redactIyzicoSecrets(
  message: string,
  secrets: Array<string | null | undefined>
): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join("[REDACTED]");
  }
  return out;
}

export function createIyzicoRandomKey(nowMs = Date.now()): string {
  return `${nowMs}${Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, "0")}`;
}

/**
 * Build HMAC hex signature for IYZWSv2.
 * Body must already be the exact JSON string (or "").
 */
export function computeIyzicoHmacHex(
  secretKey: string,
  randomKey: string,
  uriPath: string,
  requestBodyJson: string
): string {
  if (!uriPath.startsWith("/")) {
    throw new Error("IYZICO_AUTH_INVALID_URI_PATH");
  }
  const payload = `${randomKey}${uriPath}${requestBodyJson ?? ""}`;
  return createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
}

export function buildIyzicoAuthorizationHeader(input: IyzicoAuthInput): string {
  const { apiKey, secretKey, randomKey, uriPath, requestBodyJson } = input;
  if (!apiKey?.trim() || !secretKey?.trim() || !randomKey?.trim()) {
    throw new Error("IYZICO_AUTH_MISSING_CREDENTIALS");
  }
  const signature = computeIyzicoHmacHex(
    secretKey,
    randomKey,
    uriPath,
    requestBodyJson ?? ""
  );
  const authorizationString =
    `apiKey:${apiKey}` + `&randomKey:${randomKey}` + `&signature:${signature}`;
  const encoded = Buffer.from(authorizationString, "utf8").toString("base64");
  return `IYZWSv2 ${encoded}`;
}

export function buildIyzicoAuthHeaders(input: IyzicoAuthInput): IyzicoAuthHeaders {
  return {
    Authorization: buildIyzicoAuthorizationHeader(input),
    "x-iyzi-rnd": input.randomKey,
    "Content-Type": "application/json",
  };
}

/**
 * Constant-time compare of hex HMAC digests.
 * Returns false on length mismatch without throwing.
 */
export function verifyIyzicoHmacHex(
  secretKey: string,
  payload: string,
  expectedHex: string
): boolean {
  if (!expectedHex || !secretKey) return false;
  const actual = createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
  try {
    const normalizedActual = Buffer.from(actual.toLowerCase(), "utf8");
    const b = Buffer.from(expectedHex.trim().toLowerCase(), "utf8");
    if (normalizedActual.length !== b.length) return false;
    return timingSafeEqual(normalizedActual, b);
  } catch {
    return false;
  }
}

/**
 * CF retrieve response signature parameter order (official docs):
 * paymentStatus, paymentId, currency, basketId, conversationId, paidPrice, price, token
 */
export function buildCheckoutFormRetrieveSignaturePayload(parts: {
  paymentStatus?: string | null;
  paymentId?: string | null;
  currency?: string | null;
  basketId?: string | null;
  conversationId?: string | null;
  paidPrice?: string | number | null;
  price?: string | number | null;
  token?: string | null;
}): string {
  const vals = [
    parts.paymentStatus,
    parts.paymentId,
    parts.currency,
    parts.basketId,
    parts.conversationId,
    parts.paidPrice,
    parts.price,
    parts.token,
  ];
  return vals.map((v) => (v == null ? "" : String(v))).join(":");
}

/** Header name for iyzico webhook signature V3 (case-insensitive lookup). */
export const IYZICO_WEBHOOK_SIGNATURE_HEADER = "x-iyz-signature-v3";

export type IyzicoWebhookSignatureVariant = "hpp" | "direct";

/**
 * HPP / Checkout Form webhook V3 message (docs):
 * secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status
 */
export function buildIyzicoWebhookSignatureV3PayloadHpp(input: {
  secretKey: string;
  iyziEventType: string;
  iyziPaymentId: string;
  token: string;
  paymentConversationId: string;
  status: string;
}): string {
  return (
    input.secretKey +
    input.iyziEventType +
    input.iyziPaymentId +
    input.token +
    input.paymentConversationId +
    input.status
  );
}

/**
 * Direct payment webhook V3 message (docs):
 * secretKey + iyziEventType + paymentId + paymentConversationId + status
 */
export function buildIyzicoWebhookSignatureV3PayloadDirect(input: {
  secretKey: string;
  iyziEventType: string;
  paymentId: string;
  paymentConversationId: string;
  status: string;
}): string {
  return (
    input.secretKey +
    input.iyziEventType +
    input.paymentId +
    input.paymentConversationId +
    input.status
  );
}

export function computeIyzicoWebhookSignatureV3Hex(
  secretKey: string,
  message: string
): string {
  return createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
}

/**
 * Verify X-IYZ-SIGNATURE-V3 against HPP (token) or direct payment field sets.
 * Prefers HPP when `token` is present.
 */
export function verifyIyzicoWebhookSignatureV3(input: {
  secretKey: string;
  signatureHeader: string | null | undefined;
  iyziEventType: string;
  paymentConversationId: string;
  status: string;
  token?: string | null;
  iyziPaymentId?: string | null;
  paymentId?: string | null;
}): { ok: true; variant: IyzicoWebhookSignatureVariant } | { ok: false } {
  const signature = input.signatureHeader?.trim() ?? "";
  if (!signature || !input.secretKey) return { ok: false };

  const eventType = input.iyziEventType ?? "";
  const conversationId = input.paymentConversationId ?? "";
  const status = input.status ?? "";
  if (!eventType || !conversationId || !status) return { ok: false };

  const token = input.token?.trim() ?? "";
  const iyziPaymentId = String(input.iyziPaymentId ?? "").trim();
  const paymentId = String(input.paymentId ?? iyziPaymentId).trim();

  if (token) {
    if (!iyziPaymentId && !paymentId) return { ok: false };
    const message = buildIyzicoWebhookSignatureV3PayloadHpp({
      secretKey: input.secretKey,
      iyziEventType: eventType,
      iyziPaymentId: iyziPaymentId || paymentId,
      token,
      paymentConversationId: conversationId,
      status,
    });
    if (verifyIyzicoHmacHex(input.secretKey, message, signature)) {
      return { ok: true, variant: "hpp" };
    }
    return { ok: false };
  }

  if (!paymentId) return { ok: false };
  const message = buildIyzicoWebhookSignatureV3PayloadDirect({
    secretKey: input.secretKey,
    iyziEventType: eventType,
    paymentId,
    paymentConversationId: conversationId,
    status,
  });
  if (verifyIyzicoHmacHex(input.secretKey, message, signature)) {
    return { ok: true, variant: "direct" };
  }
  return { ok: false };
}

export function extractIyzicoWebhookSignatureHeader(
  headers: Headers | Record<string, string | null | undefined>
): string | null {
  if (typeof (headers as Headers).get === "function") {
    const h = headers as Headers;
    return (
      h.get("x-iyz-signature-v3") ??
      h.get("X-IYZ-SIGNATURE-V3") ??
      h.get("X-Iyz-Signature-V3") ??
      null
    );
  }
  const rec = headers as Record<string, string | null | undefined>;
  for (const [key, value] of Object.entries(rec)) {
    if (key.toLowerCase() === "x-iyz-signature-v3" && value) {
      return value;
    }
  }
  return null;
}

/**
 * Stable idempotency key for payment_webhook_events.provider_event_id.
 * Prefer iyziReferenceCode; else derive from event fields.
 */
export function buildIyzicoWebhookEventId(payload: {
  iyziReferenceCode?: string | null;
  iyziEventType?: string | null;
  paymentId?: string | number | null;
  iyziPaymentId?: string | number | null;
  paymentConversationId?: string | null;
  status?: string | null;
  token?: string | null;
}): string {
  const ref = payload.iyziReferenceCode?.trim();
  if (ref) return ref;
  const paymentId = String(payload.paymentId ?? payload.iyziPaymentId ?? "").trim();
  const parts = [
    payload.iyziEventType ?? "",
    paymentId,
    payload.paymentConversationId ?? "",
    payload.status ?? "",
    payload.token ?? "",
  ];
  return parts.join(":");
}
