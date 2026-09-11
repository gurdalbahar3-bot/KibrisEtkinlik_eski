/**
 * Phase B1 payment foundation assertions + stub settlement against staging.
 * Never logs secret values. Refuses production host.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const STAGING_HOST = "nksctgxmkymmiubkrohf.supabase.co";
const PRODUCTION_HOST = "jgvyyiojicvgsxoxlmdv.supabase.co";

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

function requireStagingEnv() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  assert.ok(url, "SUPABASE_URL missing");
  assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY missing");
  assert.ok(anonKey, "SUPABASE_ANON_KEY missing");
  const host = new URL(url).hostname;
  assert.notEqual(host, PRODUCTION_HOST, "refusing production host");
  assert.equal(host, STAGING_HOST, "expected staging host");
  return { url, serviceKey, anonKey };
}

function serviceClient() {
  const { url, serviceKey } = requireStagingEnv();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function anonClient() {
  const { url, anonKey } = requireStagingEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test("B1 allowlist includes 064 and refuses unknown 056+", async () => {
  const { ALLOWED_POST_055_MIGRATION_FILES, unexpectedPost055Migrations } =
    await import("./migration-scope-allowlist.mjs");
  assert.ok(
    ALLOWED_POST_055_MIGRATION_FILES.has("064_mvp_release_security_hardening.sql")
  );
  const unexpected = unexpectedPost055Migrations([
    { name: "064_mvp_release_security_hardening.sql", n: 64 },
    { name: "065_evil.sql", n: 65 },
  ]);
  assert.equal(unexpected.length, 1);
  assert.equal(unexpected[0].name, "065_evil.sql");
});

test("B1 refuses NEXT_PUBLIC_IYZICO_* and production iyzico base URL helper", () => {
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_API_KEY), false);
  assert.equal(Boolean(process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY), false);

  function isForbiddenIyzicoProductionBaseUrl(baseUrl) {
    if (!baseUrl) return false;
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      if (host === "api.iyzipay.com") return true;
      if (host.includes("sandbox")) return false;
      return host.endsWith("iyzipay.com") && !host.includes("sandbox");
    } catch {
      return true;
    }
  }

  assert.equal(
    isForbiddenIyzicoProductionBaseUrl("https://api.iyzipay.com"),
    true
  );
  assert.equal(
    isForbiddenIyzicoProductionBaseUrl("https://sandbox-api.iyzipay.com"),
    false
  );
});

test("B1 payment foundation schema + stub settlement gates", async (t) => {
  if (process.env.SUPABASE_DATA_SOURCE?.trim() !== "supabase") {
    t.skip("SUPABASE_DATA_SOURCE!=supabase");
    return;
  }

  const admin = serviceClient();
  const anon = anonClient();

  // Schema presence
  const { error: sessionsErr } = await admin
    .from("payment_sessions")
    .select("id")
    .limit(1);
  assert.ifError(sessionsErr);

  const { error: webhookErr } = await admin
    .from("payment_webhook_events")
    .select("id")
    .limit(1);
  assert.ifError(webhookErr);

  // Report NULL currency count — no backfill
  const { count: nullCurrencyCount, error: nullCurErr } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .is("currency", null);
  assert.ifError(nullCurErr);
  console.log(
    `B1_REPORT orders.currency IS NULL count=${nullCurrencyCount ?? 0} (no backfill)`
  );

  // Client cannot EXECUTE confirm
  const { data: anonConfirm, error: anonConfirmErr } = await anon.rpc(
    "confirm_payment_atomic",
    {
      p_order_id: "00000000-0000-0000-0000-000000000001",
      p_provider: "iyzico",
      p_provider_payment_id: "x",
      p_amount: 1,
      p_currency: "TRY",
    }
  );
  assert.ok(
    anonConfirmErr || anonConfirm?.success === false,
    "anon confirm must fail"
  );

  // Find a published event with an active ticket type
  const { data: types, error: typesErr } = await admin
    .from("event_ticket_types")
    .select("id, event_id, zone_id, price, is_active, events!inner(status)")
    .eq("is_active", true)
    .eq("events.status", "published")
    .limit(5);
  assert.ifError(typesErr);
  assert.ok(types && types.length > 0, "need published ticket type on staging");

  const ticketType = types[0];
  const eventId = ticketType.event_id;
  const zoneId = ticketType.zone_id;
  const price = Number(ticketType.price);

  const email = `b1.pay.${Date.now()}@example.com`;
  const password = `B1Pay!${Date.now().toString(36)}Aa1`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "customer" },
  });
  assert.ifError(createErr);
  assert.ok(created.user?.id);
  const userId = created.user.id;

  // Ensure profile is customer (handle_new_user metadata); soft-check only
  const { data: profile } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();
  assert.equal(profile?.account_type, "customer");

  const userClient = createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_ANON_KEY.trim(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(signInErr);

  const { data: checkout, error: checkoutErr } = await userClient.rpc(
    "checkout_ticket_only_atomic",
    {
      p_event_id: eventId,
      p_zone_id: zoneId,
      p_ticket_type_id: ticketType.id,
      p_quantity: 1,
    }
  );
  assert.ifError(checkoutErr);
  assert.equal(checkout?.success, true, JSON.stringify(checkout));
  const orderId = checkout.order_id;
  assert.ok(orderId);

  const { data: orderRow, error: orderErr } = await admin
    .from("orders")
    .select("id, status, total_amount, currency, expires_at")
    .eq("id", orderId)
    .single();
  assert.ifError(orderErr);
  assert.equal(orderRow.status, "pending_payment");
  assert.equal(orderRow.currency, "TRY", "new order must get TRY via trigger");
  const total = Number(orderRow.total_amount);
  assert.ok(total > 0);
  assert.equal(total, price);

  const paymentIdA = `stub_pay_${orderId}_a`;

  // A) correct amount → PASS
  const { data: okConfirm, error: okErr } = await admin.rpc(
    "confirm_payment_atomic",
    {
      p_order_id: orderId,
      p_provider: "iyzico",
      p_provider_payment_id: paymentIdA,
      p_amount: total,
      p_currency: "TRY",
      p_payment_method: "stub",
    }
  );
  assert.ifError(okErr);
  assert.equal(okConfirm?.success, true, JSON.stringify(okConfirm));
  assert.notEqual(okConfirm?.noop, true);

  const { data: paidOrder } = await admin
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  assert.equal(paidOrder.status, "paid");

  const { data: tickets } = await admin
    .from("tickets")
    .select("id, status, qr_code_id")
    .eq("order_id", orderId);
  assert.ok(tickets?.length);
  assert.ok(tickets.every((t) => t.status === "active" && t.qr_code_id));

  // E) second settlement same order → noop
  const { data: noopConfirm, error: noopErr } = await admin.rpc(
    "confirm_payment_atomic",
    {
      p_order_id: orderId,
      p_provider: "iyzico",
      p_provider_payment_id: `${paymentIdA}_again`,
      p_amount: total,
      p_currency: "TRY",
    }
  );
  assert.ifError(noopErr);
  assert.equal(noopConfirm?.success, true);
  assert.equal(noopConfirm?.noop, true);

  // F) same provider_payment_id duplicate on a fresh pending order
  const email2 = `b1.pay2.${Date.now()}@example.com`;
  const password2 = `B1Pay2!${Date.now().toString(36)}Aa1`;
  const { data: created2, error: create2Err } = await admin.auth.admin.createUser({
    email: email2,
    password: password2,
    email_confirm: true,
    user_metadata: { account_type: "customer" },
  });
  assert.ifError(create2Err);
  assert.ok(created2.user?.id);

  const user2 = createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_ANON_KEY.trim(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await user2.auth.signInWithPassword({ email: email2, password: password2 });
  const { data: checkout2 } = await user2.rpc("checkout_ticket_only_atomic", {
    p_event_id: eventId,
    p_zone_id: zoneId,
    p_ticket_type_id: ticketType.id,
    p_quantity: 1,
  });
  assert.equal(checkout2?.success, true, JSON.stringify(checkout2));
  const orderId2 = checkout2.order_id;

  const { data: order2Row } = await admin
    .from("orders")
    .select("total_amount, currency")
    .eq("id", orderId2)
    .single();
  const total2 = Number(order2Row.total_amount);
  assert.equal(order2Row.currency, "TRY");

  const { data: dupConfirm } = await admin.rpc("confirm_payment_atomic", {
    p_order_id: orderId2,
    p_provider: "iyzico",
    p_provider_payment_id: paymentIdA,
    p_amount: total2,
    p_currency: "TRY",
  });
  assert.equal(dupConfirm?.success, false);
  assert.equal(dupConfirm?.error_code, "DUPLICATE_PROVIDER_PAYMENT");

  // B) amount mismatch
  const { data: mismatchAmt } = await admin.rpc("confirm_payment_atomic", {
    p_order_id: orderId2,
    p_provider: "iyzico",
    p_provider_payment_id: `stub_pay_${orderId2}_bad_amt`,
    p_amount: total2 + 1,
    p_currency: "TRY",
  });
  assert.equal(mismatchAmt?.success, false);
  assert.equal(mismatchAmt?.error_code, "AMOUNT_MISMATCH");

  // C) currency mismatch
  const { data: mismatchCur } = await admin.rpc("confirm_payment_atomic", {
    p_order_id: orderId2,
    p_provider: "iyzico",
    p_provider_payment_id: `stub_pay_${orderId2}_bad_cur`,
    p_amount: total2,
    p_currency: "USD",
  });
  assert.equal(mismatchCur?.success, false);
  assert.equal(mismatchCur?.error_code, "CURRENCY_MISMATCH");

  // D) expired order → FAIL (customer-owned expire)
  const { data: expRes, error: expErr } = await user2.rpc("expire_order_atomic", {
    p_order_id: orderId2,
  });
  assert.ifError(expErr);
  assert.equal(expRes?.success, true, JSON.stringify(expRes));

  const { data: expiredConfirm } = await admin.rpc("confirm_payment_atomic", {
    p_order_id: orderId2,
    p_provider: "iyzico",
    p_provider_payment_id: `stub_pay_${orderId2}_expired`,
    p_amount: total2,
    p_currency: "TRY",
  });
  assert.equal(expiredConfirm?.success, false);
  assert.equal(expiredConfirm?.error_code, "ORDER_NOT_PAYABLE");

  // G) authenticated customer cannot confirm (EXECUTE revoked)
  const { error: userConfirmErr } = await userClient.rpc(
    "confirm_payment_atomic",
    {
      p_order_id: orderId,
      p_provider: "iyzico",
      p_provider_payment_id: "should_fail",
      p_amount: total,
      p_currency: "TRY",
    }
  );
  assert.ok(userConfirmErr, "customer JWT must not execute confirm");

  // payment_sessions insert smoke via service
  const { data: sessionRow, error: sessionInsErr } = await admin
    .from("payment_sessions")
    .insert({
      order_id: orderId,
      provider: "iyzico",
      provider_token: `tok_${orderId}`,
      conversation_id: orderId,
      status: "succeeded",
      amount: total,
      currency: "TRY",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    })
    .select("id")
    .single();
  assert.ifError(sessionInsErr);
  assert.ok(sessionRow?.id);

  // webhook idempotency unique
  const eventIdKey = `evt_${Date.now()}`;
  const { error: wh1 } = await admin.from("payment_webhook_events").insert({
    provider: "iyzico",
    provider_event_id: eventIdKey,
    event_type: "CHECKOUT_FORM_AUTH",
    payload: { stub: true },
    processing_status: "processed",
  });
  assert.ifError(wh1);
  const { error: wh2 } = await admin.from("payment_webhook_events").insert({
    provider: "iyzico",
    provider_event_id: eventIdKey,
    event_type: "CHECKOUT_FORM_AUTH",
    payload: { stub: true },
  });
  assert.ok(wh2, "duplicate webhook event must fail");
});
