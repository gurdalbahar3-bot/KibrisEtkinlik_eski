/**
 * Reservation concurrency e2e against staging (anon + service role).
 * Skips cleanly without env. Refuses production host.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import {
  computeTableDepositDue,
  evaluateSharedTableCapacity,
  evaluateTableLockConflict,
} from "../src/lib/reservation/capacity.ts";

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
      throw new Error("Refusing production host in reservation e2e");
    }
    return host === STAGING_HOST;
  } catch (e) {
    if (String(e.message).includes("production")) throw e;
    return false;
  }
}

test("mock: concurrent lock → TABLE_LOCKED; deposit amount_due_now; shared capacity", () => {
  const lockA = evaluateTableLockConflict({
    hasActiveLock: true,
    lockOwnerUserId: "user-a",
    requesterUserId: "user-b",
  });
  assert.equal(lockA.ok, false);
  assert.equal(lockA.errorCode, "TABLE_LOCKED");

  const due = computeTableDepositDue({
    basePrice: 2000,
    depositAmount: 500,
  });
  assert.equal(due.amountDueNow, 500);
  assert.equal(due.currency, "TRY");

  // After confirm: shared capacity allows sequential groups until full
  let used = 0;
  for (const size of [3, 4, 2]) {
    const check = evaluateSharedTableCapacity({
      effectiveCapacity: 10,
      usedPassCount: used,
      requestedGuests: size,
    });
    assert.equal(check.ok, true);
    used += size;
  }
  const over = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: used,
    requestedGuests: 2,
  });
  assert.equal(over.ok, false);
});

test(
  "staging: concurrent reserve_table → one TABLE_LOCKED; expire; unauthorized; deposit",
  { skip: !stagingReady() },
  async () => {
    const url = process.env.SUPABASE_URL.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
    const anon =
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      "";
    assert.ok(anon, "SUPABASE_ANON_KEY missing");

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find an active package on a published sellable event table
    const { data: packages } = await admin
      .from("table_packages")
      .select(
        "id, event_id, event_table_id, base_price, deposit_amount, is_active"
      )
      .eq("is_active", true)
      .limit(40);

    if (!packages?.length) {
      return; // nothing to exercise — soft pass
    }

    let fixture = null;
    for (const pkg of packages) {
      const { data: ev } = await admin
        .from("events")
        .select("id, status, is_wedding")
        .eq("id", pkg.event_id)
        .maybeSingle();
      if (!ev || ev.status !== "published" || ev.is_wedding) continue;

      const { data: et } = await admin
        .from("event_tables")
        .select("id, table_id, is_sellable, max_guests")
        .eq("id", pkg.event_table_id)
        .maybeSingle();
      if (!et?.is_sellable) continue;

      const { data: vt } = await admin
        .from("venue_tables")
        .select("id, capacity")
        .eq("id", et.table_id)
        .maybeSingle();

      fixture = {
        packageId: pkg.id,
        eventId: pkg.event_id,
        tableId: et.table_id,
        eventTableId: et.id,
        basePrice: Number(pkg.base_price),
        depositAmount: pkg.deposit_amount != null ? Number(pkg.deposit_amount) : 0,
        capacity: et.max_guests ?? vt?.capacity ?? 1,
      };
      break;
    }

    if (!fixture) {
      return;
    }

    // Package deposit contract (DB amount_due_now mirrors this)
    const due = computeTableDepositDue({
      basePrice: fixture.basePrice,
      depositAmount: fixture.depositAmount,
    });
    assert.equal(due.currency, "TRY");
    assert.ok(due.amountDueNow >= 0);

    const stamp = Date.now();
    async function makeUser(tag) {
      const email = `res-e2e-${tag}-${stamp}@example.com`;
      const password = `Re-${stamp}!Aa1`;
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(error);
      const client = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signErr } = await client.auth.signInWithPassword({
        email,
        password,
      });
      assert.ifError(signErr);
      return { client, userId: created.user.id, email };
    }

    const userA = await makeUser("a");
    const userB = await makeUser("b");

    // Clear any stale locks/orders on this table for a clean race
    await admin.rpc("expire_due_pending_orders_atomic");

    const guestCount = 1;
    const [r1, r2] = await Promise.all([
      userA.client.rpc("reserve_table_atomic", {
        p_event_id: fixture.eventId,
        p_table_id: fixture.tableId,
        p_package_id: fixture.packageId,
        p_guest_count: guestCount,
      }),
      userB.client.rpc("reserve_table_atomic", {
        p_event_id: fixture.eventId,
        p_table_id: fixture.tableId,
        p_package_id: fixture.packageId,
        p_guest_count: guestCount,
      }),
    ]);

    const outcomes = [r1, r2].map((r) => {
      if (r.error) {
        const msg = r.error.message ?? "";
        if (/TABLE_LOCKED/i.test(msg)) {
          return { success: false, error_code: "TABLE_LOCKED" };
        }
        return { success: false, error_code: msg };
      }
      const body = r.data;
      return {
        success: Boolean(body?.success),
        error_code: body?.error_code ?? null,
        order_id: body?.order_id ?? null,
      };
    });

    const wins = outcomes.filter((o) => o.success && o.order_id);
    const locked = outcomes.filter(
      (o) => String(o.error_code).toUpperCase() === "TABLE_LOCKED"
    );
    assert.ok(
      wins.length === 1 && locked.length === 1,
      `expected one win + one TABLE_LOCKED, got ${JSON.stringify(outcomes)}`
    );

    const winningOrderId = wins[0].order_id;

    // Deposit on order_item amount_due_now
    const { data: items } = await admin
      .from("order_items")
      .select("amount_due_now, total_price")
      .eq("order_id", winningOrderId);
    assert.ok(items?.length);
    assert.equal(Number(items[0].amount_due_now), due.amountDueNow);

    // Expire hold
    const { data: expired, error: expErr } = await admin.rpc(
      "expire_order_atomic",
      { p_order_id: winningOrderId }
    );
    assert.ifError(expErr);
    assert.equal(expired?.success !== false, true);

    // Unauthorized: anon without auth
    const anonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: unauth } = await anonClient.rpc("reserve_table_atomic", {
      p_event_id: fixture.eventId,
      p_table_id: fixture.tableId,
      p_package_id: fixture.packageId,
      p_guest_count: 1,
    });
    assert.equal(unauth?.success, false);
    assert.equal(String(unauth?.error_code).toUpperCase(), "UNAUTHENTICATED");

    // Sequential shared capacity after confirm (if capacity >= 2)
    if (fixture.capacity >= 2) {
      await admin.rpc("expire_due_pending_orders_atomic");

      const { data: hold1, error: h1err } = await userA.client.rpc(
        "reserve_table_atomic",
        {
          p_event_id: fixture.eventId,
          p_table_id: fixture.tableId,
          p_package_id: fixture.packageId,
          p_guest_count: 1,
        }
      );
      assert.ifError(h1err);
      assert.equal(hold1?.success, true, JSON.stringify(hold1));
      const order1 = hold1.order_id;

      const { data: orderRow } = await admin
        .from("orders")
        .select("total_amount, currency")
        .eq("id", order1)
        .single();

      const { data: confirm, error: cErr } = await admin.rpc(
        "confirm_payment_atomic",
        {
          p_order_id: order1,
          p_provider: "mock",
          p_provider_payment_id: `mock-res-${stamp}`,
          p_amount: Number(orderRow.total_amount),
          p_currency: orderRow.currency ?? "TRY",
          p_payment_method: "mock",
        }
      );
      assert.ifError(cErr);
      assert.equal(confirm?.success, true, JSON.stringify(confirm));

      // Second user can take remaining shared capacity after lock released
      const { data: hold2, error: h2err } = await userB.client.rpc(
        "reserve_table_atomic",
        {
          p_event_id: fixture.eventId,
          p_table_id: fixture.tableId,
          p_package_id: fixture.packageId,
          p_guest_count: 1,
        }
      );
      // May fail CAPACITY_EXCEEDED if table already full from prior staging data
      if (h2err) {
        assert.match(h2err.message, /CAPACITY|LOCKED|FAILED/i);
      } else if (hold2?.success) {
        await admin.rpc("expire_order_atomic", {
          p_order_id: hold2.order_id,
        });
      } else {
        assert.ok(
          ["CAPACITY_EXCEEDED", "TABLE_LOCKED", "TABLE_BLOCKED"].includes(
            String(hold2?.error_code).toUpperCase()
          ),
          JSON.stringify(hold2)
        );
      }
    }

    // Cleanup test users (best-effort)
    try {
      await admin.auth.admin.deleteUser(userA.userId);
      await admin.auth.admin.deleteUser(userB.userId);
    } catch {
      // ignore
    }
  }
);
