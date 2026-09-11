/**
 * Pure reservation-engine unit tests + SQL source contracts.
 * No network. Mirrors capacity/deposit/hold/lock semantics.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertTryCurrency,
  buildMixedCartTableItem,
  computeTableDepositDue,
  evaluateHoldState,
  evaluateSharedTableCapacity,
  evaluateTableLockConflict,
  HOLD_TTL_MINUTES,
  isPackageSaleCategory,
  RESERVATION_STATUS,
  simulateSharedTableGroups,
} from "../src/lib/reservation/capacity.ts";

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

test("shared capacity: groups 3+4+2+1 fill 10; +1 rejected", () => {
  const sim = simulateSharedTableGroups(10, [3, 4, 2, 1, 1]);
  assert.deepEqual(sim.accepted, [3, 4, 2, 1]);
  assert.equal(sim.rejectedAt, 4);
  assert.equal(sim.remaining, 0);

  const ok = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: 9,
    requestedGuests: 1,
  });
  assert.equal(ok.ok, true);

  const over = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: 9,
    requestedGuests: 2,
  });
  assert.equal(over.ok, false);
  assert.equal(over.errorCode, "TABLE_CAPACITY_EXCEEDED");
});

test("invalid guest count rejected", () => {
  const bad = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: 0,
    requestedGuests: 0,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.errorCode, "INVALID_PASS_COUNT");
});

test("deposit amount_due_now: deposit>0 → deposit; else base; TRY only", () => {
  const withDep = computeTableDepositDue({
    basePrice: 1000,
    depositAmount: 300,
  });
  assert.equal(withDep.currency, "TRY");
  assert.equal(withDep.amountDueNow, 300);
  assert.equal(withDep.remainingAmount, 700);

  const full = computeTableDepositDue({
    basePrice: 500,
    depositAmount: 0,
  });
  assert.equal(full.amountDueNow, 500);

  const nullDep = computeTableDepositDue({
    basePrice: 500,
    depositAmount: null,
  });
  assert.equal(nullDep.amountDueNow, 500);

  assert.equal(assertTryCurrency("TRY"), true);
  assert.equal(assertTryCurrency("try"), true);
  assert.equal(assertTryCurrency("USD"), false);

  assert.throws(() =>
    computeTableDepositDue({ basePrice: 100, depositAmount: 150 })
  );
});

test("hold TTL + lock exclusivity", () => {
  assert.equal(HOLD_TTL_MINUTES, 10);
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  assert.equal(
    evaluateHoldState({
      orderStatus: RESERVATION_STATUS.pendingPayment,
      expiresAt: "2026-01-01T12:09:00.000Z",
      nowMs: now,
    }),
    "active_hold"
  );
  assert.equal(
    evaluateHoldState({
      orderStatus: RESERVATION_STATUS.pendingPayment,
      expiresAt: "2026-01-01T11:59:00.000Z",
      nowMs: now,
    }),
    "expired"
  );
  assert.equal(
    evaluateHoldState({
      orderStatus: RESERVATION_STATUS.confirmed,
      expiresAt: "2026-01-01T12:09:00.000Z",
      nowMs: now,
    }),
    "not_hold"
  );

  assert.equal(
    evaluateTableLockConflict({
      hasActiveLock: true,
      lockOwnerUserId: "a",
      requesterUserId: "b",
    }).errorCode,
    "TABLE_LOCKED"
  );
  assert.equal(
    evaluateTableLockConflict({
      hasActiveLock: true,
      lockOwnerUserId: "a",
      requesterUserId: "a",
    }).ok,
    true
  );
});

test("mixed cart table item builder", () => {
  const item = buildMixedCartTableItem({
    tableId: "t1",
    packageId: "p1",
    guestCount: 4,
  });
  assert.deepEqual(item, {
    item_type: "table",
    table_id: "t1",
    package_id: "p1",
    guest_count: 4,
  });
  assert.throws(() =>
    buildMixedCartTableItem({ tableId: "", packageId: "p", guestCount: 1 })
  );
  assert.equal(isPackageSaleCategory("vip"), true);
  assert.equal(isPackageSaleCategory("lounge"), false);
});

test("source contracts: reserve_table_atomic + resource_locks + check_table_capacity", () => {
  const mig040 = read("supabase/migrations/040_m8_admission_backbone.sql");
  assert.match(mig040, /CREATE OR REPLACE FUNCTION public\.reserve_table_atomic/);
  assert.match(mig040, /check_table_capacity_available/);
  assert.match(mig040, /CAPACITY_EXCEEDED/);
  assert.match(mig040, /TABLE_LOCKED/);
  assert.match(mig040, /GUEST_COUNT_REQUIRED/);
  assert.match(mig040, /resource_locks/);
  assert.match(mig040, /amount_due_now/);
  assert.match(
    mig040,
    /CASE WHEN v_deposit > 0 THEN v_deposit ELSE v_package\.base_price END/
  );

  const mig034 = read("supabase/migrations/034_rls_rpc_indexes.sql");
  assert.match(
    mig034,
    /resource_locks_event_resource_active_unique/
  );

  const capacityTs = read("src/lib/reservation/capacity.ts");
  assert.match(capacityTs, /buildMixedCartTableItem/);
  assert.match(capacityTs, /evaluateSharedTableCapacity/);
  assert.match(capacityTs, /computeTableDepositDue/);

  const actions = read("src/lib/customer/checkout-actions.ts");
  assert.match(actions, /checkoutTableReservationAction/);
  assert.match(actions, /create_mixed_cart_atomic/);
  assert.match(actions, /expire_due_pending_orders_atomic/);
  assert.match(actions, /buildMixedCartTableItem/);
  assert.equal(
    /p_amount:\s*client|p_base_price:\s*client/.test(actions),
    false
  );

  assert.ok(existsSync(resolve("src/lib/customer/table-offers.ts")));
});

test("package soft deactivate + draft gate + capacity source contracts", () => {
  const layoutActions = read(
    "src/app/organizer/(app)/events/layout-actions.ts"
  );
  assert.match(layoutActions, /requireOwnedDraftEvent/);
  assert.match(layoutActions, /gateDraftLayout/);
  assert.match(layoutActions, /setEventTablePackageActiveAction/);
  assert.match(layoutActions, /p_is_active/);
  assert.match(layoutActions, /upsert_table_package_atomic/);
  assert.match(layoutActions, /upsert_event_table_atomic/);
  // Soft deactivate via upsert — not hard delete
  assert.doesNotMatch(layoutActions, /\.delete\(/);

  const panel = read("src/components/organizer/EventLayoutCommercePanel.tsx");
  assert.match(panel, /isDraft/);
  assert.match(panel, /deactivatePackage/);
  assert.match(panel, /reactivatePackage/);
  assert.match(panel, /savePackage/);
  assert.match(panel, /setEventTablePackageActiveAction/);

  const offers = read("src/lib/customer/table-offers.ts");
  assert.match(offers, /capacitySource/);
  assert.match(offers, /entry_passes/);
  assert.match(offers, /reservation_guest_count/);
  assert.match(offers, /\.eq\("is_active", true\)/);

  const checkoutUi = read(
    "src/components/customer/TableReservationCheckout.tsx"
  );
  assert.match(checkoutUi, /summaryEvent/);
  assert.match(checkoutUi, /summaryVenue/);
  assert.match(checkoutUi, /summaryTable/);
  assert.match(checkoutUi, /summaryDeposit/);
  assert.match(checkoutUi, /stateHoldPending/);

  const mig045 = read("supabase/migrations/045_event_commerce_setup.sql");
  assert.match(mig045, /upsert_table_package_atomic/);
  assert.match(mig045, /is_active/);
  // Catalog price update does not touch order_items
  assert.doesNotMatch(
    mig045,
    /UPDATE public\.order_items[\s\S]{0,80}base_price/
  );

  const docs = read("docs/CURRENT_STATE_ARCHITECTURE.md");
  assert.match(docs, /Exclusive/);
  assert.match(docs, /after confirmation/i);
  assert.match(docs, /Draft-only/);
  assert.match(docs, /capacitySource/);
});

test("guest_count cannot exceed remaining capacity (pure)", () => {
  const full = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: 10,
    requestedGuests: 1,
  });
  assert.equal(full.ok, false);

  const ok = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: 7,
    requestedGuests: 3,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.remaining, 0);

  const overflow = evaluateSharedTableCapacity({
    effectiveCapacity: 10,
    usedPassCount: 7,
    requestedGuests: 4,
  });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.errorCode, "TABLE_CAPACITY_EXCEEDED");
});
