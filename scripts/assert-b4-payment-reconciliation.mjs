/**
 * B4 payment reconciliation / failure-safety tests (pure + source contracts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildPaymentReconReport,
  isInFlightSessionStatus,
  nextSessionStatusAfterSettle,
} from "../src/lib/payments/reconciliation.ts";

const ORDER_ID = "55555555-5555-5555-5555-555555555555";

test("B4 in-flight session detection", () => {
  assert.equal(isInFlightSessionStatus("redirected"), true);
  assert.equal(isInFlightSessionStatus("succeeded"), false);
  assert.equal(isInFlightSessionStatus("expired"), false);
});

test("B4 late provider success after expiry blocks settlement", () => {
  const report = buildPaymentReconReport({
    orderId: ORDER_ID,
    orderStatus: "expired",
    orderExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    sessions: [
      {
        id: "s1",
        status: "redirected",
        expiresAt: new Date(Date.now() - 30_000).toISOString(),
      },
    ],
    succeededPaymentCount: 0,
  });
  assert.equal(report.blockSettlement, true);
  assert.ok(report.findings.includes("PAYMENT_AFTER_EXPIRY"));
  assert.ok(report.requiresManualReconciliation);
  assert.ok(report.sessionIdsToExpire.includes("s1"));
});

test("B4 pending + expires_at passed → PAYMENT_AFTER_EXPIRY", () => {
  const report = buildPaymentReconReport({
    orderId: ORDER_ID,
    orderStatus: "pending_payment",
    orderExpiresAt: new Date(Date.now() - 1).toISOString(),
    sessions: [],
    succeededPaymentCount: 0,
  });
  assert.ok(report.findings.includes("PAYMENT_AFTER_EXPIRY"));
  assert.equal(report.blockSettlement, true);
});

test("B4 paid order is reconcilable noop-friendly", () => {
  const report = buildPaymentReconReport({
    orderId: ORDER_ID,
    orderStatus: "paid",
    orderExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    sessions: [{ id: "s1", status: "succeeded", expiresAt: new Date().toISOString() }],
    succeededPaymentCount: 1,
  });
  assert.ok(report.findings.includes("ORDER_PAID"));
  assert.equal(report.blockSettlement, false);
});

test("B4 duplicate succeeded sessions flagged", () => {
  const report = buildPaymentReconReport({
    orderId: ORDER_ID,
    orderStatus: "paid",
    orderExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    sessions: [
      { id: "s1", status: "succeeded", expiresAt: new Date().toISOString() },
      { id: "s2", status: "succeeded", expiresAt: new Date().toISOString() },
    ],
    succeededPaymentCount: 2,
  });
  assert.ok(report.findings.includes("DUPLICATE_SUCCEEDED_SESSIONS"));
  assert.equal(report.requiresManualReconciliation, true);
});

test("B4 session status mapping after settle", () => {
  assert.equal(
    nextSessionStatusAfterSettle({ settlementOk: true }),
    "succeeded"
  );
  assert.equal(
    nextSessionStatusAfterSettle({
      settlementOk: false,
      errorCode: "PAYMENT_AFTER_EXPIRY",
    }),
    "expired"
  );
  assert.equal(
    nextSessionStatusAfterSettle({
      settlementOk: false,
      errorCode: "AMOUNT_MISMATCH",
    }),
    "failed"
  );
});

test("B4 service wires reconcile without refund automation", () => {
  const svc = readFileSync(resolve("src/lib/payments/service.ts"), "utf8");
  assert.match(svc, /reconcileOrderPayments/);
  assert.match(svc, /PAYMENT_AFTER_EXPIRY/);
  assert.equal(/refund_payment|autoRefund|createRefund/i.test(svc), false);

  const recon = readFileSync(
    resolve("src/lib/payments/reconciliation.ts"),
    "utf8"
  );
  assert.match(recon, /requiresManualReconciliation/);
  assert.equal(recon.includes("iyzico"), false);
});
