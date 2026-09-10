/**
 * B3 iyzico webhook signature V3 + idempotency contract tests.
 * Never logs secrets. No live charge.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildIyzicoWebhookEventId,
  buildIyzicoWebhookSignatureV3PayloadDirect,
  buildIyzicoWebhookSignatureV3PayloadHpp,
  computeIyzicoWebhookSignatureV3Hex,
  extractIyzicoWebhookSignatureHeader,
  verifyIyzicoWebhookSignatureV3,
} from "../src/lib/payments/providers/iyzico-auth.ts";

const FAKE_SECRET = "sandbox-test-secret-key-NOT-REAL";
const ORDER_ID = "44444444-4444-4444-4444-444444444444";

function loadLocalEnv(fileName = ".env.local") {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

test("B3 valid HPP / CHECKOUT_FORM_AUTH signature V3", () => {
  const fields = {
    secretKey: FAKE_SECRET,
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "28157797",
    token: "tok-cf-abc",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
  };
  const message = buildIyzicoWebhookSignatureV3PayloadHpp(fields);
  const sig = computeIyzicoWebhookSignatureV3Hex(FAKE_SECRET, message);
  const verified = verifyIyzicoWebhookSignatureV3({
    ...fields,
    signatureHeader: sig,
  });
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.variant, "hpp");
});

test("B3 valid direct payment signature V3", () => {
  const fields = {
    secretKey: FAKE_SECRET,
    iyziEventType: "API_AUTH",
    paymentId: "28157248",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
  };
  const message = buildIyzicoWebhookSignatureV3PayloadDirect(fields);
  const sig = computeIyzicoWebhookSignatureV3Hex(FAKE_SECRET, message);
  const verified = verifyIyzicoWebhookSignatureV3({
    ...fields,
    signatureHeader: sig,
  });
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.variant, "direct");
});

test("B3 invalid signature rejected", () => {
  const verified = verifyIyzicoWebhookSignatureV3({
    secretKey: FAKE_SECRET,
    signatureHeader: "deadbeef",
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "1",
    token: "tok",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
  });
  assert.equal(verified.ok, false);
});

test("B3 malformed / missing fields rejected", () => {
  const verified = verifyIyzicoWebhookSignatureV3({
    secretKey: FAKE_SECRET,
    signatureHeader: "abc",
    iyziEventType: "",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
  });
  assert.equal(verified.ok, false);
});

test("B3 event id prefers iyziReferenceCode; duplicate key stable", () => {
  const a = buildIyzicoWebhookEventId({
    iyziReferenceCode: "ref-1",
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "1",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
    token: "tok",
  });
  const b = buildIyzicoWebhookEventId({
    iyziReferenceCode: "ref-1",
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "1",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
    token: "tok",
  });
  assert.equal(a, "ref-1");
  assert.equal(a, b);

  const derived = buildIyzicoWebhookEventId({
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "9",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
    token: "t",
  });
  assert.equal(
    derived,
    `CHECKOUT_FORM_AUTH:9:${ORDER_ID}:SUCCESS:t`
  );
});

test("B3 header extraction case-insensitive", () => {
  assert.equal(
    extractIyzicoWebhookSignatureHeader({ "X-IYZ-SIGNATURE-V3": "abc" }),
    "abc"
  );
  assert.equal(
    extractIyzicoWebhookSignatureHeader(
      new Headers({ "x-iyz-signature-v3": "xyz" })
    ),
    "xyz"
  );
});

test("B3 HMAC uses secret as key; message includes secret prefix (docs)", () => {
  const message = buildIyzicoWebhookSignatureV3PayloadHpp({
    secretKey: FAKE_SECRET,
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "1",
    token: "tok",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
  });
  assert.equal(message.startsWith(FAKE_SECRET), true);
  const expected = createHmac("sha256", FAKE_SECRET)
    .update(message, "utf8")
    .digest("hex");
  assert.equal(computeIyzicoWebhookSignatureV3Hex(FAKE_SECRET, message), expected);
});

test("B3 route + service contracts (source)", () => {
  const route = readFileSync(
    resolve("src/app/api/payments/webhook/iyzico/route.ts"),
    "utf8"
  );
  assert.match(route, /handleProviderWebhook/);
  assert.match(route, /request\.text\(\)/);
  assert.equal(route.includes(FAKE_SECRET), false);
  assert.match(route, /WEBHOOK_METHOD_NOT_ALLOWED/);

  const svc = readFileSync(resolve("src/lib/payments/service.ts"), "utf8");
  assert.match(svc, /payment_webhook_events/);
  assert.match(svc, /WEBHOOK_DUPLICATE/);
  assert.match(svc, /handleProviderCallback/);
  assert.match(svc, /PAYMENT_AFTER_EXPIRY/);
  assert.equal(svc.includes("WEBHOOK_NOT_IMPLEMENTED_B3"), false);

  const provider = readFileSync(
    resolve("src/lib/payments/providers/iyzico.ts"),
    "utf8"
  );
  assert.match(provider, /verifyIyzicoWebhookSignatureV3/);
  assert.match(provider, /WEBHOOK_SIGNATURE_INVALID/);
});

test("B3 no NEXT_PUBLIC_IYZICO / production host in webhook path", () => {
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY), false);
  const auth = readFileSync(
    resolve("src/lib/payments/providers/iyzico-auth.ts"),
    "utf8"
  );
  assert.match(auth, /verifyIyzicoWebhookSignatureV3/);
  assert.equal(auth.includes("api.iyzipay.com"), false);
});
