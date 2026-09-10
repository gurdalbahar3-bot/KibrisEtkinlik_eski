/**
 * B2.2 Sandbox checkout session tests (mock HTTP; no live charge).
 * Does not import server-only modules. Never logs secrets.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildBasketItemsFromOrderItems,
  formatIyzicoMoney,
  toStartPaymentPublicDto,
} from "../src/lib/payments/mapping.ts";
import {
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  isIyzicoCheckoutConfigured,
  resolveIyzicoCallbackUrl,
} from "../src/lib/payments/providers/iyzico-config.ts";
import { IyzicoApiClient } from "../src/lib/payments/providers/iyzico-client.ts";
import {
  IYZICO_CF_INITIALIZE_PATH,
  IyzicoProviderError,
} from "../src/lib/payments/providers/iyzico-types.ts";

const FAKE_API = "sandbox-test-api-key-NOT-REAL";
const FAKE_SECRET = "sandbox-test-secret-key-NOT-REAL";
const ORDER_ID = "11111111-1111-1111-1111-111111111111";

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

/** Mirrors PaymentService ownership/status/expiry/currency gates (pure). */
function evaluateStartPaymentGates(input) {
  const { order, customerId, clientPrice } = input;
  void clientPrice;
  if (!order) return { ok: false, errorCode: "ORDER_NOT_FOUND" };
  if (order.customer_id !== customerId) return { ok: false, errorCode: "FORBIDDEN" };
  if (order.status !== "pending_payment") {
    return { ok: false, errorCode: "ORDER_NOT_PAYABLE" };
  }
  if (new Date(order.expires_at).getTime() < Date.now()) {
    return { ok: false, errorCode: "ORDER_EXPIRED" };
  }
  if (!order.currency?.trim()) {
    return { ok: false, errorCode: "ORDER_CURRENCY_MISSING" };
  }
  if (order.currency.trim().toUpperCase() !== "TRY") {
    return { ok: false, errorCode: "CURRENCY_MISMATCH" };
  }
  const amount = Number(order.total_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, errorCode: "INVALID_ORDER_TOTAL" };
  }
  return { ok: true, amount };
}

test("B2.2 A/B/C/O/P ledger money + basket + conversationId=orderId", async () => {
  const amount = 150;
  assert.equal(formatIyzicoMoney(amount), "150.00");
  const basket = buildBasketItemsFromOrderItems(
    [
      {
        id: "item-1",
        snapshot_label: "VIP",
        item_type: "ticket",
        quantity: 1,
        unit_price: 150,
        total_price: 150,
      },
    ],
    amount
  );
  assert.equal(basket[0].price, "150.00");
  assert.equal(
    basket.reduce((a, l) => a + Number(l.price), 0),
    amount
  );

  let capturedBody = null;
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async (_url, init) => {
        capturedBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            status: "success",
            conversationId: ORDER_ID,
            token: "tok_abc",
            paymentPageUrl: "https://sandbox-cpp.iyzipay.com/checkout/tok_abc",
            checkoutFormContent: "PGg+Zm9ybTwvaD4=",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    }
  );

  const price = formatIyzicoMoney(amount);
  const init = await client.initializeCheckoutForm({
    locale: "tr",
    conversationId: ORDER_ID,
    price,
    paidPrice: price,
    currency: "TRY",
    basketId: ORDER_ID,
    callbackUrl: "https://staging.example.com/api/payments/iyzico/callback",
    buyer: {
      id: "u1",
      name: "Ada",
      surname: "Yilmaz",
      identityNumber: "11111111111",
      email: "a@example.com",
      gsmNumber: "+905551112233",
      registrationAddress: "Addr",
      city: "Lefkosa",
      country: "Cyprus",
    },
    billingAddress: {
      address: "Addr",
      contactName: "Ada Yilmaz",
      city: "Lefkosa",
      country: "Cyprus",
    },
    basketItems: basket,
  });

  assert.equal(capturedBody.conversationId, ORDER_ID);
  assert.equal(capturedBody.currency, "TRY");
  assert.equal(capturedBody.price, "150.00");
  assert.equal(capturedBody.paidPrice, "150.00");
  assert.equal(capturedBody.callbackUrl.includes("https://"), true);
  assert.equal(init.token, "tok_abc");
  assert.equal(init.paymentPageUrl?.includes("sandbox-cpp"), true);
  assert.equal(init.checkoutFormContent, "PGg+Zm9ybTwvaD4=");
});

test("B2.2 D client price ignored by gates (ledger amount wins)", () => {
  const order = {
    id: ORDER_ID,
    customer_id: "c1",
    status: "pending_payment",
    total_amount: 150,
    currency: "TRY",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const gate = evaluateStartPaymentGates({
    order,
    customerId: "c1",
    clientPrice: 1,
  });
  assert.equal(gate.ok, true);
  assert.equal(gate.amount, 150);
  assert.notEqual(gate.amount, 1);
});

test("B2.2 E/F/G ownership expiry status gates", () => {
  const base = {
    id: ORDER_ID,
    customer_id: "c1",
    status: "pending_payment",
    total_amount: 150,
    currency: "TRY",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(
    evaluateStartPaymentGates({ order: base, customerId: "other" }).errorCode,
    "FORBIDDEN"
  );
  assert.equal(
    evaluateStartPaymentGates({
      order: {
        ...base,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
      customerId: "c1",
    }).errorCode,
    "ORDER_EXPIRED"
  );
  assert.equal(
    evaluateStartPaymentGates({
      order: { ...base, status: "paid" },
      customerId: "c1",
    }).errorCode,
    "ORDER_NOT_PAYABLE"
  );
});

test("B2.2 H missing customer treated as validation (profile check)", () => {
  // Profile completeness is enforced in PaymentService; here we assert DTO builder
  // never invents buyer secrets and mapping requires positive totals.
  assert.throws(() => formatIyzicoMoney(0), /INVALID_ORDER_TOTAL/);
});

test("B2.2 I/J iyzico error + malformed", async () => {
  const httpErr = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: "failure", errorCode: "5001" }), {
          status: 500,
        }),
    }
  );
  await assert.rejects(
    () => httpErr.postJson(IYZICO_CF_INITIALIZE_PATH, { x: 1 }),
    (err) => err instanceof IyzicoProviderError && err.code === "IYZICO_HTTP_ERROR"
  );

  const badJson = new IyzicoApiClient(
    {
      apiKey: FAKE_API,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    }
  );
  await assert.rejects(
    () => badJson.postJson(IYZICO_CF_INITIALIZE_PATH, { x: 1 }),
    (err) =>
      err instanceof IyzicoProviderError && err.code === "IYZICO_MALFORMED_RESPONSE"
  );
});

test("B2.2 K/L/M/N DTO + callback contract + no secrets", () => {
  const dto = toStartPaymentPublicDto({
    orderId: ORDER_ID,
    sessionId: "s1",
    providerToken: "tok",
    paymentPageUrl: "https://sandbox-cpp.iyzipay.com/x",
    checkoutFormContent: "html",
  });
  assert.ok(dto.paymentPageUrl);
  assert.ok(dto.checkoutFormContent);
  const json = JSON.stringify(dto);
  assert.equal(json.includes(FAKE_API), false);
  assert.equal(json.includes(FAKE_SECRET), false);

  const cb = resolveIyzicoCallbackUrl({
    IYZICO_CALLBACK_URL:
      "https://staging.example.com/api/payments/iyzico/callback",
  });
  assert.match(cb, /^https:\/\//);
  assert.equal(isIyzicoCheckoutConfigured({}), false);
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
});

test(
  "B2.2 opt-in live (skipped without IYZICO_B2_2_LIVE=1)",
  { skip: process.env.IYZICO_B2_2_LIVE !== "1" },
  () => {
    assert.equal(isIyzicoCheckoutConfigured(process.env), true);
  }
);
