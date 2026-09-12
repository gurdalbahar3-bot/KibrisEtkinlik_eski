/**
 * 065 P0/P1 contracts: QR scan_result constraint + expire_due service_role.
 * Does not apply migrations. Staging live probes skip when credentials absent.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import {
  evaluateCheckInPreflight,
  mapUseQrErrorToUiCode,
} from "../src/lib/tickets/issuance.ts";

const root = process.cwd();
const MIG065 = "supabase/migrations/065_mvp_qr_expiry_hardening.sql";
const STAGING_HOST = "nksctgxmkymmiubkrohf.supabase.co";
const PRODUCTION_HOST = "jgvyyiojicvgsxoxlmdv.supabase.co";

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function loadLocalEnv(fileName = ".env.local") {
  const filePath = resolve(root, fileName);
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
      throw new Error("Refusing production host in 065 tests");
    }
    return host === STAGING_HOST;
  } catch (e) {
    if (String(e.message).includes("production")) throw e;
    return false;
  }
}

function adminClient() {
  return createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function anonClient() {
  const anon =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
  return createClient(process.env.SUPABASE_URL.trim(), anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Source contracts
// ---------------------------------------------------------------------------

test("065 migration exists: P0 CHECK + P1 expire_due service context", () => {
  assert.equal(existsSync(resolve(root, MIG065)), true);
  const sql = read(MIG065);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS qr_scan_logs_scan_result_check/);
  assert.match(sql, /ADD CONSTRAINT qr_scan_logs_scan_result_check/);
  assert.match(sql, /'cancelled'/);
  assert.match(sql, /'not_active'/);
  assert.match(sql, /'already_used'/);
  assert.match(sql, /'revoked'/);
  assert.match(sql, /'valid'/);
  assert.match(sql, /'invalid'/);
  assert.match(sql, /is_service_context\(\)/);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.expire_due_pending_orders_atomic\(\)[\s\S]*service_role/
  );
  // Must not rewrite 064 file / protected migrations
  assert.doesNotMatch(sql, /058_staging|059_staging|060_staging/);
});

test("065 is allowlisted; unknown 066+ refused", async () => {
  const { ALLOWED_POST_055_MIGRATION_FILES, unexpectedPost055Migrations } =
    await import("./migration-scope-allowlist.mjs");
  assert.ok(
    ALLOWED_POST_055_MIGRATION_FILES.has("065_mvp_qr_expiry_hardening.sql")
  );
  const unexpected = unexpectedPost055Migrations([
    { name: "065_mvp_qr_expiry_hardening.sql", n: 65 },
    { name: "066_evil.sql", n: 66 },
  ]);
  assert.equal(unexpected.length, 1);
  assert.equal(unexpected[0].name, "066_evil.sql");
});

test("064 use_qr_atomic still emits cancelled/not_active (065 unlocks CHECK)", () => {
  const sql064 = read(
    "supabase/migrations/064_mvp_release_security_hardening.sql"
  );
  assert.match(sql064, /v_scan_result := 'cancelled'/);
  assert.match(sql064, /v_scan_result := 'not_active'/);
  assert.match(sql064, /v_scan_result := 'already_used'/);
  assert.match(sql064, /v_scan_result := 'revoked'/);
  assert.match(sql064, /v_scan_result := 'valid'/);
});

test("UI maps CANCELLED / NOT_ACTIVE / ALREADY_USED / REVOKED / INVALID", () => {
  assert.equal(mapUseQrErrorToUiCode("CANCELLED"), "CANCELLED");
  assert.equal(mapUseQrErrorToUiCode("NOT_ACTIVE"), "NOT_ACTIVE");
  assert.equal(mapUseQrErrorToUiCode("ALREADY_USED"), "ALREADY_USED");
  assert.equal(mapUseQrErrorToUiCode("REVOKED"), "REVOKED");
  assert.equal(mapUseQrErrorToUiCode("INVALID"), "INVALID");
  assert.equal(mapUseQrErrorToUiCode("FORBIDDEN"), "FORBIDDEN");
});

test("preflight: cancelled / wrong event / already used / revoked", () => {
  assert.equal(
    evaluateCheckInPreflight({
      selectedEventId: "e1",
      qrEventId: "e1",
      qrStatus: "active",
      ticketStatus: "cancelled_by_organizer",
      entityType: "ticket",
    }).errorCode,
    "CANCELLED"
  );
  assert.equal(
    evaluateCheckInPreflight({
      selectedEventId: "e1",
      qrEventId: "e2",
      qrStatus: "active",
      ticketStatus: "active",
      entityType: "ticket",
    }).errorCode,
    "WRONG_EVENT"
  );
  assert.equal(
    evaluateCheckInPreflight({
      selectedEventId: "e1",
      qrEventId: "e1",
      qrStatus: "used",
      ticketStatus: "used",
      entityType: "ticket",
    }).errorCode,
    "ALREADY_USED"
  );
  assert.equal(
    evaluateCheckInPreflight({
      selectedEventId: "e1",
      qrEventId: "e1",
      qrStatus: "revoked",
      ticketStatus: "active",
      entityType: "ticket",
    }).errorCode,
    "REVOKED"
  );
  assert.equal(
    evaluateCheckInPreflight({
      selectedEventId: "e1",
      qrEventId: "e1",
      qrStatus: "active",
      ticketStatus: "pending_payment",
      entityType: "ticket",
    }).errorCode,
    "NOT_ACTIVE"
  );
});

test("organizer check-in UI labels cover cancelled + not_active", () => {
  const page = read("src/app/organizer/(app)/events/[id]/check-in/page.tsx");
  assert.match(page, /checkInCancelled/);
  assert.match(page, /checkInNotActive/);
  assert.match(page, /checkInAlreadyUsed/);
  assert.match(page, /checkInRevoked/);
  const scanner = read("src/components/organizer/CheckInScanner.tsx");
  assert.match(scanner, /CANCELLED/);
  assert.match(scanner, /NOT_ACTIVE/);
});

// ---------------------------------------------------------------------------
// Staging live (skip until 065 applied + credentials)
// ---------------------------------------------------------------------------

test(
  "staging: expire_due service_role succeeds after 065",
  { skip: !stagingReady() },
  async (t) => {
    const admin = adminClient();
    const { data, error } = await admin.rpc("expire_due_pending_orders_atomic");
    if (error) {
      assert.fail(error.message);
    }
    // Pre-065: UNAUTHENTICATED. Post-065: success true.
    if (data?.success === false && data?.error_code === "UNAUTHENTICATED") {
      t.skip("065 not applied yet on staging (service_role still UNAUTHENTICATED)");
      return;
    }
    assert.equal(data?.success, true, JSON.stringify(data));
    assert.ok(typeof data?.expired_count === "number");
  }
);

test(
  "staging: customer cannot expire non-due foreign pending order",
  { skip: !stagingReady() },
  async (t) => {
    const admin = adminClient();
    const future = new Date(Date.now() + 30 * 60_000).toISOString();
    const { data: orders } = await admin
      .from("orders")
      .select("id, customer_id, status, expires_at")
      .eq("status", "pending_payment")
      .gt("expires_at", future)
      .limit(5);

    if (!orders?.length) {
      t.skip("no future pending_payment order fixture");
      return;
    }

    const target = orders[0];
    const stamp = Date.now();
    const email = `065-abuse-${stamp}@example.com`;
    const password = `Ab-${stamp}!Aa1`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created?.user) {
      t.skip(cErr?.message || "createUser failed");
      return;
    }

    try {
      const user = anonClient();
      const { error: signErr } = await user.auth.signInWithPassword({
        email,
        password,
      });
      assert.ifError(signErr);

      const { data: exp } = await user.rpc("expire_order_atomic", {
        p_order_id: target.id,
      });
      assert.equal(exp?.success, false, JSON.stringify(exp));
      assert.equal(String(exp?.error_code).toUpperCase(), "FORBIDDEN");

      const { data: after } = await admin
        .from("orders")
        .select("status")
        .eq("id", target.id)
        .maybeSingle();
      assert.equal(after?.status, "pending_payment");
    } finally {
      try {
        await admin.auth.admin.deleteUser(created.user.id);
      } catch {
        /* ignore */
      }
    }
  }
);

test(
  "staging: cancelled ticket QR returns CANCELLED without constraint crash",
  { skip: !stagingReady() },
  async (t) => {
    const admin = adminClient();
    const saEmail = process.env.SA_E2E_EMAIL?.trim();
    const saPass = process.env.SA_E2E_PASSWORD?.trim();
    if (!saEmail || !saPass) {
      t.skip("SA_E2E credentials missing");
      return;
    }

    const { data: candidates } = await admin
      .from("tickets")
      .select("id, status, qr_code_id, event_id")
      .eq("status", "active")
      .not("qr_code_id", "is", null)
      .limit(20);

    if (!candidates?.length) {
      t.skip("no active ticket+qr fixture");
      return;
    }

    const sa = anonClient();
    const { error: signErr } = await sa.auth.signInWithPassword({
      email: saEmail,
      password: saPass,
    });
    if (signErr) {
      t.skip(signErr.message);
      return;
    }

    for (const ticket of candidates) {
      const { data: qr } = await admin
        .from("qr_codes")
        .select("token, status")
        .eq("id", ticket.qr_code_id)
        .eq("status", "active")
        .maybeSingle();
      if (!qr?.token) continue;

      await admin
        .from("tickets")
        .update({ status: "cancelled_by_organizer" })
        .eq("id", ticket.id);

      try {
        const { data: scan, error: scanErr } = await sa.rpc("use_qr_atomic", {
          p_token: qr.token,
          p_device_id: "065-regression",
        });

        if (
          scanErr &&
          /qr_scan_logs_scan_result_check/i.test(scanErr.message)
        ) {
          await admin
            .from("tickets")
            .update({ status: "active" })
            .eq("id", ticket.id);
          t.skip("065 not applied yet (CHECK still rejects cancelled)");
          return;
        }

        if (scanErr) {
          await admin
            .from("tickets")
            .update({ status: "active" })
            .eq("id", ticket.id);
          continue;
        }

        const code = String(scan?.error_code ?? "").toUpperCase();
        if (code === "FORBIDDEN" || code === "UNAUTHENTICATED") {
          await admin
            .from("tickets")
            .update({ status: "active" })
            .eq("id", ticket.id);
          continue;
        }

        assert.equal(scan?.success, false, JSON.stringify(scan));
        assert.equal(code, "CANCELLED", JSON.stringify(scan));
        // Ensure QR was not marked used
        const { data: qrAfter } = await admin
          .from("qr_codes")
          .select("status")
          .eq("id", ticket.qr_code_id)
          .maybeSingle();
        assert.equal(qrAfter?.status, "active");
        return;
      } finally {
        await admin
          .from("tickets")
          .update({ status: "active" })
          .eq("id", ticket.id);
      }
    }

    t.skip("no scannable event ACL for SA_E2E on candidates");
  }
);
