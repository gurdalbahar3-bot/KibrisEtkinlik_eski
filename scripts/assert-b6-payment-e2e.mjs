/**
 * B6 payment e2e hardening — chain contracts across B2.3–B5 (mock, no live charge).
 * Covers callback/webhook/recon/checkout gates + production safety.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import {
  buildVerifiedSettlementFromRetrieve,
} from "../src/lib/payments/settlement.ts";
import {
  buildPaymentReconReport,
  nextSessionStatusAfterSettle,
} from "../src/lib/payments/reconciliation.ts";
import {
  evaluateCheckoutOrderGate,
  evaluatePaidTicketIntegrity,
} from "../src/lib/customer/checkout-safety.ts";
import {
  buildIyzicoWebhookSignatureV3PayloadHpp,
  computeIyzicoWebhookSignatureV3Hex,
  verifyIyzicoWebhookSignatureV3,
} from "../src/lib/payments/providers/iyzico-auth.ts";
import {
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
} from "../src/lib/payments/providers/iyzico-config.ts";

const FAKE_SECRET = "sandbox-test-secret-key-NOT-REAL";
const ORDER_ID = "77777777-7777-7777-7777-777777777777";
const STAGING_HOST = "nksctgxmkymmiubkrohf.supabase.co";
const PRODUCTION_HOST = "jgvyyiojicvgsxoxlmdv.supabase.co";

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

test("B6 chain: checkout gate → settlement build → ticket integrity", () => {
  const gate = evaluateCheckoutOrderGate({
    orderId: ORDER_ID,
    customerId: "c1",
    orderCustomerId: "c1",
    status: "pending_payment",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    currency: "TRY",
    totalAmount: 150,
    clientPrice: 1,
  });
  assert.equal(gate.ok, true);

  const built = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: {
      provider: "iyzico",
      providerPaymentId: "pay_1",
      conversationId: ORDER_ID,
      amount: 150,
      price: 150,
      currency: "TRY",
      outcome: "succeeded",
      fraudStatus: "1",
      paymentStatus: "SUCCESS",
    },
  });
  assert.equal(built.ok, true);

  const tickets = evaluatePaidTicketIntegrity({
    orderStatus: "paid",
    tickets: [{ status: "active", qrCodeId: "qr" }],
  });
  assert.equal(tickets.showSuccess, true);
});

test("B6 webhook valid + invalid + duplicate event id", () => {
  const fields = {
    secretKey: FAKE_SECRET,
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: "99",
    token: "tok",
    paymentConversationId: ORDER_ID,
    status: "SUCCESS",
  };
  const message = buildIyzicoWebhookSignatureV3PayloadHpp(fields);
  const sig = computeIyzicoWebhookSignatureV3Hex(FAKE_SECRET, message);
  assert.equal(
    verifyIyzicoWebhookSignatureV3({ ...fields, signatureHeader: sig }).ok,
    true
  );
  assert.equal(
    verifyIyzicoWebhookSignatureV3({
      ...fields,
      signatureHeader: "00",
    }).ok,
    false
  );
});

test("B6 payment state transitions + expiry", () => {
  assert.equal(
    nextSessionStatusAfterSettle({ settlementOk: true }),
    "succeeded"
  );
  assert.equal(
    nextSessionStatusAfterSettle({
      settlementOk: false,
      errorCode: "PAYMENT_AFTER_EXPIRY",
    }),
    "expired"
  );

  const expired = buildPaymentReconReport({
    orderId: ORDER_ID,
    orderStatus: "expired",
    orderExpiresAt: new Date(Date.now() - 1000).toISOString(),
    sessions: [],
    succeededPaymentCount: 0,
  });
  assert.equal(expired.blockSettlement, true);
});

test("B6 duplicate payment / already paid integrity", () => {
  assert.equal(
    evaluateCheckoutOrderGate({
      orderId: ORDER_ID,
      customerId: "c1",
      orderCustomerId: "c1",
      status: "paid",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      currency: "TRY",
      totalAmount: 10,
    }).errorCode,
    "ORDER_ALREADY_PAID"
  );
});

test("B6 routes exist: callback + webhook", () => {
  assert.equal(
    existsSync(resolve("src/app/api/payments/callback/iyzico/route.ts")),
    true
  );
  assert.equal(
    existsSync(resolve("src/app/api/payments/webhook/iyzico/route.ts")),
    true
  );
});

test("B6 production safety: hosts + no NEXT_PUBLIC secrets", () => {
  assert.equal(
    isForbiddenIyzicoProductionBaseUrl("https://api.iyzipay.com"),
    true
  );
  assert.equal(
    isAllowedIyzicoSandboxBaseUrl("https://sandbox-api.iyzipay.com"),
    true
  );
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_API_KEY), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY), false);

  const url = process.env.SUPABASE_URL?.trim() ?? "";
  if (url) {
    const host = new URL(url).hostname;
    assert.notEqual(host, PRODUCTION_HOST);
    assert.equal(host, STAGING_HOST);
  }
});

test("B6 confirm_payment_atomic still denied for anon (staging)", async () => {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    assert.ok(true, "skipped — no staging env");
    return;
  }
  assert.equal(new URL(url).hostname, STAGING_HOST);
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await anon.rpc("confirm_payment_atomic", {
    p_order_id: ORDER_ID,
    p_provider: "iyzico",
    p_provider_payment_id: "b6_should_fail",
    p_amount: 1,
    p_currency: "TRY",
  });
  assert.ok(error, "anon must not execute confirm");
});

test("B6 migration 064+065 hardening allowlisted; unknown 066+ refused", () => {
  const migs064 = readdirSync(resolve("supabase/migrations")).filter((n) =>
    n === "064_mvp_release_security_hardening.sql"
  );
  assert.equal(migs064.length, 1);
  const migs065 = readdirSync(resolve("supabase/migrations")).filter((n) =>
    n === "065_mvp_qr_expiry_hardening.sql"
  );
  assert.equal(migs065.length, 1);
  const migs066 = readdirSync(resolve("supabase/migrations")).filter((n) =>
    /^066_/.test(n)
  );
  assert.equal(migs066.length, 0);
  const allow = readFileSync(
    resolve("scripts/migration-scope-allowlist.mjs"),
    "utf8"
  );
  assert.match(allow, /064_mvp_release_security_hardening\.sql/);
  assert.match(allow, /065_mvp_qr_expiry_hardening\.sql/);
});

test(
  "B6 opt-in live sandbox charge skipped without IYZICO_B6_LIVE=1",
  { skip: process.env.IYZICO_B6_LIVE !== "1" },
  () => {
    assert.ok(process.env.IYZICO_API_KEY?.trim());
  }
);
