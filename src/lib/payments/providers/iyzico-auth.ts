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
    const a = Buffer.from(actual, "utf8");
    const b = Buffer.from(expectedHex, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
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
