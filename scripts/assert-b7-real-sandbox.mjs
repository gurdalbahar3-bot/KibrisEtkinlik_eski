/**
 * B7 real iyzico Sandbox E2E harness.
 * - Always runs B7-A environment safety (no secrets printed).
 * - Live initialize/payment only when IYZICO_B7_LIVE=1 AND sandbox creds present.
 * - Never fabricates credentials or pretends a live charge succeeded.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertIyzicoSandboxConfigPresent,
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  isIyzicoCheckoutConfigured,
  loadIyzicoSandboxConfig,
  resolveIyzicoCallbackUrl,
} from "../src/lib/payments/providers/iyzico-config.ts";
import { IyzicoApiClient } from "../src/lib/payments/providers/iyzico-client.ts";
import { formatIyzicoMoney } from "../src/lib/payments/mapping.ts";

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

function sandboxReady() {
  const present = assertIyzicoSandboxConfigPresent(process.env);
  if (!present.configured) {
    return { ok: false, reason: `missing ${present.missing.join(",")}` };
  }
  try {
    loadIyzicoSandboxConfig(process.env);
    resolveIyzicoCallbackUrl(process.env);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "config_invalid",
    };
  }
  const base = process.env.IYZICO_BASE_URL?.trim() ?? "";
  if (!isAllowedIyzicoSandboxBaseUrl(base)) {
    return { ok: false, reason: "base_url_not_sandbox" };
  }
  if (isForbiddenIyzicoProductionBaseUrl(base)) {
    return { ok: false, reason: "production_iyzico_forbidden" };
  }
  return { ok: true, reason: "ready" };
}

const liveOptIn = process.env.IYZICO_B7_LIVE === "1";
const ready = sandboxReady();

test("B7-A staging Supabase host only", () => {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  assert.ok(url, "SUPABASE_URL required for B7-A");
  const host = new URL(url).hostname;
  assert.equal(host, STAGING_HOST);
  assert.notEqual(host, PRODUCTION_HOST);
});

test("B7-A no NEXT_PUBLIC_IYZICO_* secrets", () => {
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_API_KEY), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_BASE_URL), false);
});

test("B7-A production iyzico host rejected by helpers", () => {
  assert.equal(
    isForbiddenIyzicoProductionBaseUrl("https://api.iyzipay.com"),
    true
  );
  assert.equal(
    isAllowedIyzicoSandboxBaseUrl("https://sandbox-api.iyzipay.com"),
    true
  );
});

test("B7-A callback/webhook route contracts exist", () => {
  assert.equal(
    existsSync(resolve("src/app/api/payments/callback/iyzico/route.ts")),
    true
  );
  assert.equal(
    existsSync(resolve("src/app/api/payments/webhook/iyzico/route.ts")),
    true
  );
  const cb = readFileSync(
    resolve("src/app/api/payments/callback/iyzico/route.ts"),
    "utf8"
  );
  assert.match(cb, /CALLBACK_GET_NOT_SUPPORTED|GET_NOT_SUPPORTED|GET\(/);
  assert.match(cb, /handleProviderCallback/);
  const wh = readFileSync(
    resolve("src/app/api/payments/webhook/iyzico/route.ts"),
    "utf8"
  );
  assert.match(wh, /handleProviderWebhook/);
  assert.match(wh, /request\.text\(\)/);
});

test("B7-A sandbox credential presence is reported without secrets", () => {
  // Intentionally does not print key material — only readiness boolean.
  assert.equal(typeof ready.ok, "boolean");
  assert.equal(typeof ready.reason, "string");
  assert.equal(ready.reason.includes("sandbox-test-secret"), false);
  if (!ready.ok) {
    assert.match(
      ready.reason,
      /missing|config_invalid|base_url|production/i
    );
  }
});

test(
  "B7-B live Sandbox CF initialize (opt-in)",
  {
    skip:
      !liveOptIn || !ready.ok
        ? !liveOptIn
          ? "set IYZICO_B7_LIVE=1 after sandbox creds exist"
          : `BLOCKED — ${ready.reason}`
        : false,
  },
  async () => {
    assert.equal(isIyzicoCheckoutConfigured(process.env), true);
    const config = loadIyzicoSandboxConfig(process.env);
    assert.equal(isAllowedIyzicoSandboxBaseUrl(config.baseUrl), true);
    const client = new IyzicoApiClient(config);
    const orderId = `b7-${Date.now()}`;
    const price = formatIyzicoMoney(1);
    const init = await client.initializeCheckoutForm({
      locale: "tr",
      conversationId: orderId,
      price,
      paidPrice: price,
      currency: "TRY",
      basketId: orderId,
      callbackUrl: resolveIyzicoCallbackUrl(process.env),
      buyer: {
        id: "b7-buyer",
        name: "B7",
        surname: "Sandbox",
        identityNumber:
          process.env.IYZICO_SANDBOX_IDENTITY_NUMBER?.trim() || "11111111111",
        email: "b7.sandbox@example.com",
        gsmNumber: "+905551112233",
        registrationAddress:
          process.env.IYZICO_SANDBOX_BUYER_ADDRESS?.trim() || "Staging Address",
        city: process.env.IYZICO_SANDBOX_BUYER_CITY?.trim() || "Lefkosa",
        country: process.env.IYZICO_SANDBOX_BUYER_COUNTRY?.trim() || "Cyprus",
      },
      billingAddress: {
        address:
          process.env.IYZICO_SANDBOX_BUYER_ADDRESS?.trim() || "Staging Address",
        contactName: "B7 Sandbox",
        city: process.env.IYZICO_SANDBOX_BUYER_CITY?.trim() || "Lefkosa",
        country: process.env.IYZICO_SANDBOX_BUYER_COUNTRY?.trim() || "Cyprus",
      },
      basketItems: [
        {
          id: "item-1",
          name: "B7 Test Ticket",
          category1: "Ticket",
          itemType: "VIRTUAL",
          price,
        },
      ],
    });
    assert.equal(init.status, "success");
    assert.ok(init.token?.trim(), "initialize must return token");
    assert.ok(
      init.paymentPageUrl || init.checkoutFormContent,
      "initialize must return paymentPageUrl or checkoutFormContent"
    );
    if (init.paymentPageUrl) {
      assert.match(init.paymentPageUrl, /^https:\/\//);
      assert.equal(init.paymentPageUrl.includes("api.iyzipay.com"), false);
    }
  }
);

test("B7-C..G live payment/callback/webhook/ticket chain blocked without creds", () => {
  if (ready.ok && liveOptIn) {
    // Harness present; full card payment still requires hosted-page interaction
    // and is documented in B7 report — not auto-asserted here.
    assert.ok(true);
    return;
  }
  assert.equal(ready.ok, false);
  assert.match(ready.reason, /missing/i);
});
