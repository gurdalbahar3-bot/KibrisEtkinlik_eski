/**
 * B5 customer checkout hardening tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  evaluateCheckoutOrderGate,
  evaluatePaidTicketIntegrity,
} from "../src/lib/customer/checkout-safety.ts";

const ORDER_ID = "66666666-6666-6666-6666-666666666666";

test("B5 client price/currency ignored; ledger wins", () => {
  const gate = evaluateCheckoutOrderGate({
    orderId: ORDER_ID,
    customerId: "c1",
    orderCustomerId: "c1",
    status: "pending_payment",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    currency: "TRY",
    totalAmount: 250,
    clientPrice: 1,
    clientCurrency: "USD",
  });
  assert.equal(gate.ok, true);
  if (gate.ok) {
    assert.equal(gate.amount, 250);
    assert.equal(gate.currency, "TRY");
  }
});

test("B5 rejects paid / expired / foreign customer", () => {
  const base = {
    orderId: ORDER_ID,
    customerId: "c1",
    orderCustomerId: "c1",
    status: "pending_payment",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    currency: "TRY",
    totalAmount: 100,
  };
  assert.equal(
    evaluateCheckoutOrderGate({ ...base, orderCustomerId: "other" }).errorCode,
    "FORBIDDEN"
  );
  assert.equal(
    evaluateCheckoutOrderGate({ ...base, status: "paid" }).errorCode,
    "ORDER_ALREADY_PAID"
  );
  assert.equal(
    evaluateCheckoutOrderGate({
      ...base,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    }).errorCode,
    "ORDER_EXPIRED"
  );
});

test("B5 paid without tickets / incomplete QR blocked", () => {
  assert.equal(
    evaluatePaidTicketIntegrity({
      orderStatus: "paid",
      tickets: [],
    }).errorCode,
    "PAID_WITHOUT_TICKETS"
  );
  assert.equal(
    evaluatePaidTicketIntegrity({
      orderStatus: "paid",
      tickets: [{ status: "active", qrCodeId: null }],
    }).errorCode,
    "PAID_TICKETS_INCOMPLETE"
  );
  assert.equal(
    evaluatePaidTicketIntegrity({
      orderStatus: "paid",
      tickets: [{ status: "active", qrCodeId: "qr1" }],
    }).showSuccess,
    true
  );
});

test("B5 actions + success page contracts", () => {
  const actions = readFileSync(
    resolve("src/lib/customer/checkout-actions.ts"),
    "utf8"
  );
  assert.match(actions, /evaluateCheckoutOrderGate/);
  assert.match(actions, /expire_due_pending_orders_atomic/);
  assert.match(actions, /clientPrice/);
  assert.equal(/p_amount:\s*client|clientCurrency/.test(actions) && actions.includes("p_amount: Number(client"), false);

  const success = readFileSync(
    resolve("src/app/[locale]/checkout/success/page.tsx"),
    "utf8"
  );
  assert.match(success, /evaluatePaidTicketIntegrity/);
  assert.match(success, /void browserStatus/);
});
