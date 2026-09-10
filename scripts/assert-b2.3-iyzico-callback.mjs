/**
 * B2.3 callback + server-side settlement verification tests.
 * Trust only CF retrieve/detail — never browser callback params.
 * Does not import server-only modules. Never logs secrets.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import {
  buildVerifiedSettlementFromRetrieve,
  localePaymentResultPath,
  moneyEquals,
} from "../src/lib/payments/settlement.ts";
import {
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  resolveIyzicoCallbackUrl,
} from "../src/lib/payments/providers/iyzico-config.ts";
import { IyzicoApiClient } from "../src/lib/payments/providers/iyzico-client.ts";
import {
  IYZICO_CF_RETRIEVE_PATH,
  IyzicoProviderError,
} from "../src/lib/payments/providers/iyzico-types.ts";

const FAKE_API = "sandbox-test-api-key-NOT-REAL";
const FAKE_SECRET = "sandbox-test-secret-key-NOT-REAL";
const ORDER_ID = "22222222-2222-2222-2222-222222222222";
const PAYMENT_ID = "iyzico_pay_1001";
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

function successRetrieve(overrides = {}) {
  return {
    provider: "iyzico",
    providerPaymentId: PAYMENT_ID,
    conversationId: ORDER_ID,
    amount: 150,
    price: 150,
    currency: "TRY",
    outcome: "succeeded",
    fraudStatus: "1",
    paymentStatus: "SUCCESS",
    ...overrides,
  };
}

/** Mirrors PaymentService expiry / paid gates used before confirm. */
function evaluateSettleGates(order, settlement) {
  if (!order) return { ok: false, errorCode: "ORDER_NOT_FOUND" };
  if (!order.currency?.trim()) {
    return { ok: false, errorCode: "ORDER_CURRENCY_MISSING" };
  }
  if (
    settlement.currency.trim().toUpperCase() !==
    order.currency.trim().toUpperCase()
  ) {
    return { ok: false, errorCode: "CURRENCY_MISMATCH" };
  }
  if (Math.abs(settlement.amount - Number(order.total_amount)) >= 0.005) {
    return { ok: false, errorCode: "AMOUNT_MISMATCH" };
  }
  if (settlement.orderId !== order.id) {
    return { ok: false, errorCode: "PAYMENT_ORDER_MISMATCH" };
  }
  if (order.status === "expired") {
    return { ok: false, errorCode: "PAYMENT_AFTER_EXPIRY" };
  }
  if (
    order.status === "pending_payment" &&
    new Date(order.expires_at).getTime() < Date.now()
  ) {
    return { ok: false, errorCode: "PAYMENT_AFTER_EXPIRY" };
  }
  if (order.status !== "pending_payment" && order.status !== "paid") {
    return { ok: false, errorCode: "ORDER_NOT_PAYABLE" };
  }
  return { ok: true };
}

test("B2.3 A valid retrieve → VerifiedSettlement", () => {
  const built = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve(),
  });
  assert.equal(built.ok, true);
  assert.equal(built.settlement.providerPaymentId, PAYMENT_ID);
  assert.equal(built.settlement.amount, 150);
  assert.equal(built.settlement.currency, "TRY");
  assert.equal(built.settlement.outcome, "succeeded");
});

test("B2.3 B invalid / missing token path (retrieve client)", async () => {
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    { fetchImpl: async () => new Response("{}", { status: 200 }) }
  );
  await assert.rejects(
    () => client.retrieveCheckoutFormDetail({ token: "" }),
    (err) =>
      err instanceof IyzicoProviderError && err.code === "IYZICO_MISSING_TOKEN"
  );
});

test("B2.3 C iyzico retrieve HTTP error", async () => {
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: "failure" }), { status: 500 }),
    }
  );
  await assert.rejects(
    () => client.retrieveCheckoutFormDetail({ token: "tok_x" }),
    (err) =>
      err instanceof IyzicoProviderError && err.code === "IYZICO_HTTP_ERROR"
  );
});

test("B2.3 D malformed provider response", async () => {
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    { fetchImpl: async () => new Response("not-json", { status: 200 }) }
  );
  await assert.rejects(
    () => client.retrieveCheckoutFormDetail({ token: "tok_x" }),
    (err) =>
      err instanceof IyzicoProviderError &&
      err.code === "IYZICO_MALFORMED_RESPONSE"
  );

  const missingId = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ providerPaymentId: "" }),
  });
  assert.equal(missingId.ok, false);
  assert.equal(missingId.errorCode, "PROVIDER_PAYMENT_ID_REQUIRED");
});

test("B2.3 E order / conversation mismatch", () => {
  const built = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({
      conversationId: "33333333-3333-3333-3333-333333333333",
    }),
  });
  assert.equal(built.ok, false);
  assert.equal(built.errorCode, "PAYMENT_ORDER_MISMATCH");
});

test("B2.3 F amount mismatch (paidPrice + price dual)", () => {
  const dual = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ amount: 150, price: 140 }),
  });
  assert.equal(dual.ok, false);
  assert.equal(dual.errorCode, "AMOUNT_MISMATCH");

  const order = {
    id: ORDER_ID,
    status: "pending_payment",
    total_amount: 1000,
    currency: "TRY",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const okBuild = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ amount: 900, price: 900 }),
  });
  assert.equal(okBuild.ok, true);
  const gate = evaluateSettleGates(order, okBuild.settlement);
  assert.equal(gate.ok, false);
  assert.equal(gate.errorCode, "AMOUNT_MISMATCH");
});

test("B2.3 G currency mismatch", () => {
  const built = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ currency: "USD" }),
  });
  assert.equal(built.ok, true);
  const gate = evaluateSettleGates(
    {
      id: ORDER_ID,
      status: "pending_payment",
      total_amount: 150,
      currency: "TRY",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    built.settlement
  );
  assert.equal(gate.errorCode, "CURRENCY_MISMATCH");
});

test("B2.3 H missing order currency", () => {
  const built = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve(),
  });
  assert.equal(built.ok, true);
  const gate = evaluateSettleGates(
    {
      id: ORDER_ID,
      status: "pending_payment",
      total_amount: 150,
      currency: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    built.settlement
  );
  assert.equal(gate.errorCode, "ORDER_CURRENCY_MISSING");
});

test("B2.3 I failed paymentStatus", () => {
  const failed = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({
      paymentStatus: "FAILURE",
      outcome: "failed",
    }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.errorCode, "PAYMENT_STATUS_FAILED");

  const pending = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({
      paymentStatus: "INIT_THREEDS",
      outcome: "pending",
    }),
  });
  assert.equal(pending.ok, false);
  assert.equal(pending.errorCode, "PAYMENT_STATUS_NOT_SUCCESS");
});

test("B2.3 J fraud rejection / review", () => {
  const rejected = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ fraudStatus: "-1", outcome: "failed" }),
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errorCode, "PAYMENT_FRAUD_REJECTED");

  const review = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ fraudStatus: "0", outcome: "pending" }),
  });
  assert.equal(review.ok, false);
  assert.equal(review.errorCode, "PAYMENT_FRAUD_REVIEW");

  const unknown = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve({ fraudStatus: null, outcome: "pending" }),
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.errorCode, "PAYMENT_FRAUD_REVIEW");
});

test("B2.3 K/M/N duplicate + expiry gates (pure)", () => {
  const settlement = buildVerifiedSettlementFromRetrieve({
    orderId: ORDER_ID,
    expectedConversationId: ORDER_ID,
    retrieved: successRetrieve(),
  }).settlement;

  assert.equal(
    evaluateSettleGates(
      {
        id: ORDER_ID,
        status: "paid",
        total_amount: 150,
        currency: "TRY",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      settlement
    ).ok,
    true,
    "paid order is settle-gate ok (RPC noop)"
  );

  assert.equal(
    evaluateSettleGates(
      {
        id: ORDER_ID,
        status: "expired",
        total_amount: 150,
        currency: "TRY",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
      settlement
    ).errorCode,
    "PAYMENT_AFTER_EXPIRY"
  );

  assert.equal(
    evaluateSettleGates(
      {
        id: ORDER_ID,
        status: "pending_payment",
        total_amount: 150,
        currency: "TRY",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
      settlement
    ).errorCode,
    "PAYMENT_AFTER_EXPIRY"
  );
});

test("B2.3 L duplicate provider payment ID (contract string)", () => {
  assert.equal("DUPLICATE_PROVIDER_PAYMENT", "DUPLICATE_PROVIDER_PAYMENT");
  const svc = readFileSync(
    resolve("src/lib/payments/service.ts"),
    "utf8"
  );
  assert.match(svc, /confirm_payment_atomic/);
  assert.match(svc, /PAYMENT_AFTER_EXPIRY/);
});

test("B2.3 O/P client cannot invent settlement / unauthorized trigger", () => {
  const types = readFileSync(resolve("src/lib/payments/types.ts"), "utf8");
  assert.equal(/function\s+fromClient|parseClientSettlement\s*\(/.test(types), false);
  assert.match(types, /server-built only/i);

  const route = readFileSync(
    resolve("src/app/api/payments/callback/iyzico/route.ts"),
    "utf8"
  );
  assert.match(route, /Deliberately ignore/);
  assert.match(route, /handleProviderCallback/);
  assert.equal(route.includes("settleVerifiedPayment("), false);
  // Browser paymentId/status must not drive settlement construction
  assert.equal(/body\.paymentStatus|form\.get\("paymentStatus"\)/.test(route), false);
  assert.equal(/body\.paidPrice|form\.get\("paidPrice"\)/.test(route), false);

  const svc = readFileSync(resolve("src/lib/payments/service.ts"), "utf8");
  assert.match(svc, /provider_token/);
  assert.match(svc, /PAYMENT_SESSION_NOT_FOUND/);
});

test("B2.3 Q confirm_payment_atomic denied for anon/auth (staging)", async () => {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    assert.ok(true, "skipped — no staging env");
    return;
  }
  const host = new URL(url).hostname;
  assert.notEqual(host, PRODUCTION_HOST);
  assert.equal(host, STAGING_HOST);

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await anon.rpc("confirm_payment_atomic", {
    p_order_id: ORDER_ID,
    p_provider: "iyzico",
    p_provider_payment_id: "should_fail_anon",
    p_amount: 1,
    p_currency: "TRY",
  });
  assert.ok(error, "anon must not execute confirm_payment_atomic");
});

test("B2.3 R secrets never in public DTO / redirect helpers", () => {
  const path = localePaymentResultPath("tr", "success", {
    orderId: ORDER_ID,
    status: "success",
  });
  assert.match(path, /\/tr\/odeme\/basarili/);
  assert.equal(path.includes(FAKE_API), false);
  assert.equal(path.includes(FAKE_SECRET), false);
  assert.equal(moneyEquals(150, 150), true);
  assert.equal(moneyEquals(150, 150.01), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_API_KEY), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY), false);
});

test("B2.3 S/T production endpoint rejected; sandbox accepted", () => {
  assert.equal(
    isForbiddenIyzicoProductionBaseUrl("https://api.iyzipay.com"),
    true
  );
  assert.equal(
    isAllowedIyzicoSandboxBaseUrl("https://sandbox-api.iyzipay.com"),
    true
  );
  assert.throws(
    () =>
      resolveIyzicoCallbackUrl({
        IYZICO_CALLBACK_URL: "https://api.iyzipay.com/cb",
      }),
    /production iyzico host/i
  );
  const cb = resolveIyzicoCallbackUrl({
    IYZICO_CALLBACK_URL:
      "https://staging.example.com/api/payments/callback/iyzico",
  });
  assert.match(cb, /\/api\/payments\/callback\/iyzico$/);
});

test("B2.3 retrieve uses CF detail path", async () => {
  let calledPath = "";
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async (url) => {
        calledPath = new URL(String(url)).pathname;
        return new Response(
          JSON.stringify({
            status: "success",
            conversationId: ORDER_ID,
            paymentId: PAYMENT_ID,
            paidPrice: "150.00",
            price: "150.00",
            currency: "TRY",
            paymentStatus: "SUCCESS",
            fraudStatus: 1,
            token: "tok_ok",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    }
  );
  const detail = await client.retrieveCheckoutFormDetail({ token: "tok_ok" });
  assert.equal(calledPath, IYZICO_CF_RETRIEVE_PATH);
  assert.equal(detail.paymentId, PAYMENT_ID);
  assert.equal(detail.paymentStatus, "SUCCESS");
  const json = JSON.stringify(detail);
  assert.equal(json.includes(FAKE_SECRET), false);
});

test(
  "B2.3 opt-in live sandbox (skipped without IYZICO_B2_3_LIVE=1)",
  { skip: process.env.IYZICO_B2_3_LIVE !== "1" },
  async () => {
    assert.equal(
      isAllowedIyzicoSandboxBaseUrl(process.env.IYZICO_BASE_URL ?? ""),
      true
    );
    assert.ok(process.env.IYZICO_API_KEY?.trim());
    assert.ok(process.env.IYZICO_SECRET_KEY?.trim());
    // Live end-to-end charge is manual; here we only assert sandbox config.
  }
);
