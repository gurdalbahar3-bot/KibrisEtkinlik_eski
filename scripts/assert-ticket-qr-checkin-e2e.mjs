/**
 * Mock-payment Ticket → QR → Check-in e2e (staging service_role confirm; no iyzico).
 * Skips cleanly when staging credentials are missing.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import { classifyTicketIssuance } from "../src/lib/tickets/issuance.ts";
import { evaluatePaidTicketIntegrity } from "../src/lib/customer/checkout-safety.ts";

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

function stagingReady() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const anon =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  if (!url || !service || !anon) return false;
  try {
    const host = new URL(url).hostname;
    if (host === PRODUCTION_HOST) {
      throw new Error("Refusing production host in ticket/QR e2e");
    }
    return host === STAGING_HOST;
  } catch (e) {
    if (String(e.message).includes("production")) throw e;
    return false;
  }
}

test("mock chain contract: PAID → ticket integrity → check-in preflight codes", () => {
  const integrity = evaluatePaidTicketIntegrity({
    orderStatus: "paid",
    expectedQuantity: 2,
    tickets: [
      { status: "active", qrCodeId: "qr-a" },
      { status: "active", qrCodeId: "qr-b" },
    ],
  });
  assert.equal(integrity.showSuccess, true);

  const classified = classifyTicketIssuance({
    orderStatus: "paid",
    expectedQuantity: 2,
    tickets: [
      { id: "1", status: "active", qrCodeId: "qr-a", orderItemId: null },
      { id: "2", status: "active", qrCodeId: "qr-b", orderItemId: null },
    ],
  });
  assert.equal(classified.ok, true);
});

test(
  "staging: checkout → confirm_payment (mock) → tickets/QR → duplicate confirm noop → organizer use_qr",
  { skip: !stagingReady() },
  async () => {
    const url = process.env.SUPABASE_URL.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
    const anon =
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      "";
    assert.ok(anon, "anon key missing");
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = `ticket-qr-e2e-${Date.now()}@example.com`;
    const password = `Tq-${Date.now()}!Aa1`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(createErr);
    const userId = created.user.id;

    const { data: types } = await admin
      .from("event_ticket_types")
      .select("id, event_id, zone_id, price, max_per_order")
      .eq("is_active", true)
      .limit(20);

    assert.ok(types?.length, "need active ticket type on staging");

    let ticketType = null;
    for (const tt of types) {
      const { data: ev } = await admin
        .from("events")
        .select("id, status, owner_id")
        .eq("id", tt.event_id)
        .maybeSingle();
      if (ev?.status === "published") {
        ticketType = { ...tt, owner_id: ev.owner_id };
        break;
      }
    }
    assert.ok(ticketType, "need published event ticket type");

    const qty = Math.min(2, ticketType.max_per_order ?? 2);
    const userClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    assert.ifError(signErr);

    const { data: checkout, error: checkoutErr } = await userClient.rpc(
      "checkout_ticket_only_atomic",
      {
        p_event_id: ticketType.event_id,
        p_zone_id: ticketType.zone_id,
        p_ticket_type_id: ticketType.id,
        p_quantity: qty,
      }
    );
    assert.ifError(checkoutErr);
    const orderId = checkout?.order_id ?? checkout?.orderId;
    assert.ok(orderId, `checkout failed: ${JSON.stringify(checkout)}`);

    const { data: order } = await admin
      .from("orders")
      .select("id, status, total_amount, currency")
      .eq("id", orderId)
      .single();

    const providerPaymentId = `mock-ticket-qr-${Date.now()}`;
    const { data: confirm1, error: c1err } = await admin.rpc(
      "confirm_payment_atomic",
      {
        p_order_id: orderId,
        p_provider: "mock",
        p_provider_payment_id: providerPaymentId,
        p_amount: Number(order.total_amount),
        p_currency: order.currency ?? "TRY",
        p_payment_method: "mock",
      }
    );
    assert.ifError(c1err);
    assert.equal(confirm1?.success, true);

    const { data: tickets } = await admin
      .from("tickets")
      .select("id, status, qr_code_id, order_id")
      .eq("order_id", orderId);
    assert.equal(tickets?.length, qty);
    assert.ok(tickets.every((t) => t.status === "active" && t.qr_code_id));

    const integrity = classifyTicketIssuance({
      orderStatus: "paid",
      expectedQuantity: qty,
      tickets: tickets.map((t) => ({
        id: t.id,
        status: t.status,
        qrCodeId: t.qr_code_id,
        orderItemId: null,
      })),
    });
    assert.equal(integrity.ok, true);

    // Duplicate confirm (callback/webhook replay) → noop, same tickets
    const { data: confirm2 } = await admin.rpc("confirm_payment_atomic", {
      p_order_id: orderId,
      p_provider: "mock",
      p_provider_payment_id: providerPaymentId,
      p_amount: Number(order.total_amount),
      p_currency: order.currency ?? "TRY",
      p_payment_method: "mock",
    });
    assert.equal(confirm2?.success, true);
    assert.equal(confirm2?.noop, true);

    const { data: ticketsAfter } = await admin
      .from("tickets")
      .select("id")
      .eq("order_id", orderId);
    assert.equal(ticketsAfter?.length, qty);

    const qrIds = tickets.map((t) => t.qr_code_id);
    const { data: qrs } = await admin
      .from("qr_codes")
      .select("id, token, status, event_id, entity_id")
      .in("id", qrIds);
    assert.equal(qrs?.length, qty);
    for (const qr of qrs) {
      assert.match(qr.token, /^[0-9a-f]{64}$/i);
      assert.equal(qr.status, "active");
    }

    // Unauthorized customer cannot check in
    const { data: forbiddenScan } = await userClient.rpc("use_qr_atomic", {
      p_token: qrs[0].token,
      p_device_id: "e2e-customer",
    });
    assert.equal(forbiddenScan?.success, false);
    assert.equal(forbiddenScan?.error_code, "FORBIDDEN");

    const ownerId = ticketType.owner_id;
    assert.ok(ownerId);

    // Temporarily grant scan rights by pointing owner at test user (restored in finally).
    const previousOwner = ownerId;
    try {
      const { error: ownErr } = await admin
        .from("events")
        .update({ owner_id: userId })
        .eq("id", ticketType.event_id);
      assert.ifError(ownErr);

      const { data: scan1, error: scanErr } = await userClient.rpc(
        "use_qr_atomic",
        {
          p_token: qrs[0].token,
          p_device_id: "e2e-organizer-web",
        }
      );
      assert.ifError(scanErr);
      assert.equal(scan1?.success, true, JSON.stringify(scan1));

      const { data: ticketUsed } = await admin
        .from("tickets")
        .select("status")
        .eq("id", qrs[0].entity_id)
        .single();
      assert.equal(ticketUsed.status, "used");

      const { data: scan2 } = await userClient.rpc("use_qr_atomic", {
        p_token: qrs[0].token,
        p_device_id: "e2e-organizer-web",
      });
      assert.equal(scan2?.success, false);
      assert.equal(String(scan2?.error_code).toUpperCase(), "ALREADY_USED");

      const { data: logs } = await admin
        .from("qr_scan_logs")
        .select("id, scan_result, device_id")
        .eq("qr_code_id", qrs[0].id)
        .order("scanned_at", { ascending: true });
      assert.ok((logs?.length ?? 0) >= 2);
      assert.ok(logs.some((l) => l.scan_result === "valid"));
      assert.ok(logs.some((l) => l.scan_result === "already_used"));
    } finally {
      await admin
        .from("events")
        .update({ owner_id: previousOwner })
        .eq("id", ticketType.event_id);
    }
  }
);
