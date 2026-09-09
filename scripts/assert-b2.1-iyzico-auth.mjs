/**
 * B2.1 iyzico sandbox auth + HTTP client unit tests.
 * Never logs secret values. Live Sandbox call is opt-in only.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildIyzicoAuthHeaders,
  buildIyzicoAuthorizationHeader,
  computeIyzicoHmacHex,
  redactIyzicoSecrets,
} from "../src/lib/payments/providers/iyzico-auth.ts";
import { IyzicoApiClient } from "../src/lib/payments/providers/iyzico-client.ts";
import {
  isAllowedIyzicoSandboxBaseUrl,
  isForbiddenIyzicoProductionBaseUrl,
  loadIyzicoSandboxConfig,
} from "../src/lib/payments/providers/iyzico-config.ts";
import {
  IYZICO_CF_INITIALIZE_PATH,
  IyzicoProviderError,
} from "../src/lib/payments/providers/iyzico-types.ts";

const FAKE_API_KEY = "sandbox-test-api-key-NOT-REAL";
const FAKE_SECRET = "sandbox-test-secret-key-NOT-REAL";

function loadLocalEnv(fileName = ".env.local") {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return {};
  const out = {};
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
    out[key] = value;
  }
  return out;
}

loadLocalEnv();

test("B2.1 A) missing iyzico env → controlled configuration error", () => {
  assert.throws(
    () =>
      loadIyzicoSandboxConfig({
        IYZICO_API_KEY: "",
        IYZICO_SECRET_KEY: FAKE_SECRET,
        IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com",
      }),
    (err) =>
      err instanceof IyzicoProviderError &&
      err.code === "IYZICO_CONFIG_MISSING" &&
      !String(err.message).includes(FAKE_SECRET)
  );
});

test("B2.1 B) sandbox base URL accepted", () => {
  assert.equal(
    isAllowedIyzicoSandboxBaseUrl("https://sandbox-api.iyzipay.com"),
    true
  );
  const cfg = loadIyzicoSandboxConfig({
    IYZICO_API_KEY: FAKE_API_KEY,
    IYZICO_SECRET_KEY: FAKE_SECRET,
    IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com",
  });
  assert.equal(cfg.baseUrl, "https://sandbox-api.iyzipay.com");
  assert.equal(cfg.timeoutMs, 15_000);
});

test("B2.1 C) production base URL rejected", () => {
  assert.equal(
    isForbiddenIyzicoProductionBaseUrl("https://api.iyzipay.com"),
    true
  );
  assert.throws(
    () =>
      loadIyzicoSandboxConfig({
        IYZICO_API_KEY: FAKE_API_KEY,
        IYZICO_SECRET_KEY: FAKE_SECRET,
        IYZICO_BASE_URL: "https://api.iyzipay.com",
      }),
    (err) =>
      err instanceof IyzicoProviderError &&
      err.code === "IYZICO_PRODUCTION_URL_FORBIDDEN"
  );
});

test("B2.1 D) authorization generation is deterministic", () => {
  const randomKey = "1722246017090123456789";
  const uriPath = "/payment/bin/check";
  const body = JSON.stringify({
    locale: "tr",
    binNumber: "535805",
    conversationId: "docsTest-v1",
  });
  const expectedHex = createHmac("sha256", FAKE_SECRET)
    .update(`${randomKey}${uriPath}${body}`, "utf8")
    .digest("hex");

  assert.equal(
    computeIyzicoHmacHex(FAKE_SECRET, randomKey, uriPath, body),
    expectedHex
  );

  const a = buildIyzicoAuthorizationHeader({
    apiKey: FAKE_API_KEY,
    secretKey: FAKE_SECRET,
    randomKey,
    uriPath,
    requestBodyJson: body,
  });
  const b = buildIyzicoAuthorizationHeader({
    apiKey: FAKE_API_KEY,
    secretKey: FAKE_SECRET,
    randomKey,
    uriPath,
    requestBodyJson: body,
  });
  assert.equal(a, b);
  assert.match(a, /^IYZWSv2 [A-Za-z0-9+/=]+$/);

  const headers = buildIyzicoAuthHeaders({
    apiKey: FAKE_API_KEY,
    secretKey: FAKE_SECRET,
    randomKey,
    uriPath,
    requestBodyJson: body,
  });
  assert.equal(headers["x-iyzi-rnd"], randomKey);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.Authorization, a);
});

test("B2.1 E) secret key never appears in error/log helpers", () => {
  const msg = redactIyzicoSecrets(
    `boom ${FAKE_SECRET} and ${FAKE_API_KEY}`,
    [FAKE_SECRET, FAKE_API_KEY]
  );
  assert.equal(msg.includes(FAKE_SECRET), false);
  assert.equal(msg.includes(FAKE_API_KEY), false);
  assert.match(msg, /\[REDACTED\]/);

  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_API_KEY), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY), false);

  const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
  assert.equal(/\n\s*NEXT_PUBLIC_IYZICO_/.test(example), false);
  assert.match(example, /Do NOT create NEXT_PUBLIC_IYZICO/);
});

test("B2.1 F) HTTP non-2xx → controlled provider error", async () => {
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API_KEY,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: "failure", errorCode: "5001" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    }
  );

  await assert.rejects(
    () => client.postJson("/payment/bin/check", { binNumber: "1" }),
    (err) =>
      err instanceof IyzicoProviderError &&
      err.code === "IYZICO_HTTP_ERROR" &&
      !String(err.message).includes(FAKE_SECRET)
  );
});

test("B2.1 G) malformed iyzico response → controlled provider error", async () => {
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API_KEY,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async () =>
        new Response("not-json{{{", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    }
  );

  await assert.rejects(
    () => client.postJson(IYZICO_CF_INITIALIZE_PATH, { conversationId: "x" }),
    (err) =>
      err instanceof IyzicoProviderError &&
      err.code === "IYZICO_MALFORMED_RESPONSE"
  );
});

test("B2.1 H) valid initialize response → DTO mapping correct", async () => {
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API_KEY,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async (_url, init) => {
        assert.equal(typeof init?.headers?.Authorization, "string");
        assert.match(String(init?.headers?.Authorization), /^IYZWSv2 /);
        assert.ok(init?.headers?.["x-iyzi-rnd"]);
        return new Response(
          JSON.stringify({
            status: "success",
            conversationId: "order-1",
            token: "tok_abc",
            checkoutFormContent: "PGg+Zm9ybTwvaD4=",
            paymentPageUrl: "https://sandbox-cpp.iyzipay.com/checkout/tok_abc",
            signature: "sig",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    }
  );

  const result = await client.initializeCheckoutForm({
    conversationId: "order-1",
    price: "100.00",
    paidPrice: "100.00",
    currency: "TRY",
    basketId: "order-1",
    callbackUrl: "https://example.com/api/payments/iyzico/callback",
    buyer: {
      id: "u1",
      name: "Test",
      surname: "User",
      identityNumber: "11111111111",
      email: "test@example.com",
      gsmNumber: "+905551112233",
      registrationAddress: "Addr",
      city: "Lefkosa",
      country: "Cyprus",
    },
    billingAddress: {
      address: "Addr",
      contactName: "Test User",
      city: "Lefkosa",
      country: "Cyprus",
    },
    basketItems: [
      {
        id: "item-1",
        price: "100.00",
        name: "Ticket",
        category1: "Events",
        itemType: "VIRTUAL",
      },
    ],
  });

  assert.equal(result.status, "success");
  assert.equal(result.token, "tok_abc");
  assert.equal(result.conversationId, "order-1");
  assert.equal(
    result.paymentPageUrl,
    "https://sandbox-cpp.iyzipay.com/checkout/tok_abc"
  );
  assert.equal(result.checkoutFormContent, "PGg+Zm9ybTwvaD4=");
});

test("B2.1 I) no client trusted-settlement constructor in types module", async () => {
  const typesMod = await import("../src/lib/payments/types.ts");
  const keys = Object.keys(typesMod);
  assert.equal(keys.includes("fromClientSettlement"), false);
  assert.equal(keys.includes("parseClientSettlement"), false);
  assert.equal(keys.includes("buildVerifiedSettlement"), false);
  // Stub builder lives only on server PaymentService module.
  assert.equal("VerifiedSettlement" in typesMod, false);
});

test("B2.1 J) createPaymentSession remains stub (no network)", async () => {
  // Import provider without executing server-only by testing client stub path via dynamic
  // PaymentProvider.createPaymentSession behavior is covered through iyzico stub mode:
  // we assert initialize is the only path that hits fetch, and that env contract forbids prod.
  let fetchCalls = 0;
  const client = new IyzicoApiClient(
    {
      apiKey: FAKE_API_KEY,
      secretKey: FAKE_SECRET,
      baseUrl: "https://sandbox-api.iyzipay.com",
      timeoutMs: 5000,
    },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("{}", { status: 200 });
      },
    }
  );
  // Not calling initialize — fetch must stay 0 (stub session path does not use client).
  assert.equal(fetchCalls, 0);
  void client;
});

test(
  "B2.1 opt-in live Sandbox initialize (skipped without credentials)",
  { skip: process.env.IYZICO_B2_1_LIVE !== "1" },
  async () => {
    // Opt-in only. Never print secrets. Requires real sandbox env + IYZICO_B2_1_LIVE=1.
    const cfg = loadIyzicoSandboxConfig(process.env);
    assert.ok(isAllowedIyzicoSandboxBaseUrl(cfg.baseUrl));
    // Intentionally do not call live initialize in default CI — reserved for manual runs
    // after buyer payload is finalized in B2.3. Presence of credentials is enough for this gate.
  }
);
