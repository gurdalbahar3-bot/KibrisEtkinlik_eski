/**
 * Ticket / QR / check-in unit + source contracts (no live iyzico).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildTicketQrPayload,
  classifyTicketIssuance,
  evaluateCheckInPreflight,
  isSecureQrToken,
  mapUseQrErrorToUiCode,
} from "../src/lib/tickets/issuance.ts";
import { evaluatePaidTicketIntegrity } from "../src/lib/customer/checkout-safety.ts";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

test("successful payment → tickets active with QR (qty 1)", () => {
  const r = classifyTicketIssuance({
    orderStatus: "paid",
    expectedQuantity: 1,
    tickets: [{ id: "a", status: "active", qrCodeId: "qr1", orderItemId: "oi" }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.code, "OK");
});

test("quantity > 1 → one ticket row per unit", () => {
  const r = classifyTicketIssuance({
    orderStatus: "paid",
    expectedQuantity: 3,
    tickets: [
      { id: "a", status: "active", qrCodeId: "q1", orderItemId: "oi" },
      { id: "b", status: "active", qrCodeId: "q2", orderItemId: "oi" },
      { id: "c", status: "active", qrCodeId: "q3", orderItemId: "oi" },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.activeWithQr, 3);
});

test("paid without tickets / incomplete QR blocked", () => {
  assert.equal(
    classifyTicketIssuance({
      orderStatus: "paid",
      expectedQuantity: 1,
      tickets: [],
    }).code,
    "PAID_WITHOUT_TICKETS"
  );
  assert.equal(
    classifyTicketIssuance({
      orderStatus: "paid",
      expectedQuantity: 1,
      tickets: [{ id: "a", status: "active", qrCodeId: null, orderItemId: null }],
    }).code,
    "PAID_TICKETS_INCOMPLETE"
  );
});

test("duplicate QR binding detected", () => {
  const r = classifyTicketIssuance({
    orderStatus: "paid",
    expectedQuantity: 2,
    tickets: [
      { id: "a", status: "active", qrCodeId: "same", orderItemId: null },
      { id: "b", status: "active", qrCodeId: "same", orderItemId: null },
    ],
  });
  assert.equal(r.code, "DUPLICATE_QR_RISK");
});

test("QR payload is opaque token only (no PII)", () => {
  const token = "a".repeat(64);
  assert.equal(buildTicketQrPayload(token), token);
  assert.equal(isSecureQrToken(token), true);
  assert.equal(isSecureQrToken("short"), false);
  assert.equal(isSecureQrToken("email@example.com"), false);
});

test("check-in preflight: wrong event / cancelled / already used", () => {
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
      qrStatus: "active",
      ticketStatus: "cancelled_by_organizer",
      entityType: "ticket",
    }).errorCode,
    "CANCELLED"
  );
  assert.equal(
    evaluateCheckInPreflight({
      selectedEventId: "e1",
      qrEventId: "e1",
      qrStatus: "active",
      ticketStatus: "active",
      entityType: "ticket",
    }).ok,
    true
  );
});

test("unauthorized / invalid QR map to UI codes", () => {
  assert.equal(mapUseQrErrorToUiCode("FORBIDDEN"), "FORBIDDEN");
  assert.equal(mapUseQrErrorToUiCode("ALREADY_USED"), "ALREADY_USED");
  assert.equal(mapUseQrErrorToUiCode("nope"), "INVALID");
});

test("checkout integrity bridges issuance classifier", () => {
  assert.equal(
    evaluatePaidTicketIntegrity({
      orderStatus: "paid",
      tickets: [{ status: "active", qrCodeId: "qr" }],
    }).showSuccess,
    true
  );
});

test("confirm_payment_atomic issues QR with gen_random_bytes(32) hex + paid noop", () => {
  const sql = read("supabase/migrations/063_staging_payment_foundation.sql");
  assert.match(sql, /encode\(extensions\.gen_random_bytes\(32\),\s*'hex'\)/);
  assert.match(sql, /IF v_order\.status = 'paid'/);
  assert.match(sql, /'noop',\s*true/);
  assert.match(sql, /status = 'pending_payment'/);
  assert.match(sql, /qr_codes/);
});

test("use_qr_atomic: auth, can_scan, already_used audit, ticket → used", () => {
  const sql = read("supabase/migrations/040_m8_admission_backbone.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.use_qr_atomic/);
  assert.match(sql, /can_scan_event/);
  assert.match(sql, /already_used/);
  assert.match(sql, /qr_scan_logs/);
  assert.match(sql, /UPDATE public\.tickets SET status = 'used'/);
});

test("065 unlocks cancelled/not_active scan_result for 064 use_qr_atomic", () => {
  const sql065 = read("supabase/migrations/065_mvp_qr_expiry_hardening.sql");
  const sql064 = read(
    "supabase/migrations/064_mvp_release_security_hardening.sql"
  );
  assert.match(sql064, /v_scan_result := 'cancelled'/);
  assert.match(sql064, /v_scan_result := 'not_active'/);
  assert.match(sql065, /'cancelled'/);
  assert.match(sql065, /'not_active'/);
  assert.match(sql065, /qr_scan_logs_scan_result_check/);
  assert.equal(mapUseQrErrorToUiCode("CANCELLED"), "CANCELLED");
  assert.equal(mapUseQrErrorToUiCode("NOT_ACTIVE"), "NOT_ACTIVE");
});

test("customer ticket detail + organizer check-in UI exist", () => {
  assert.ok(
    existsSync(resolve(root, "src/app/[locale]/account/tickets/[id]/page.tsx"))
  );
  assert.ok(
    existsSync(
      resolve(root, "src/app/organizer/(app)/events/[id]/check-in/page.tsx")
    )
  );
  assert.ok(
    existsSync(resolve(root, "src/components/organizer/CheckInScanner.tsx"))
  );
  const detail = read("src/app/[locale]/account/tickets/[id]/page.tsx");
  assert.match(detail, /renderTicketQrDataUrl/);
  assert.doesNotMatch(detail, /email|phone|identity/i);
  const checkIn = read("src/lib/organizer/data/check-in.ts");
  assert.match(checkIn, /use_qr_atomic/);
  assert.match(checkIn, /evaluateCheckInPreflight/);
  assert.match(checkIn, /ALREADY_USED/);
});

test("routing includes /account/tickets/[id]", () => {
  const routing = read("src/lib/i18n/routing.ts");
  assert.match(routing, /\/account\/tickets\/\[id\]/);
});
