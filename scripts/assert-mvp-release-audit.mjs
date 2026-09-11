/**
 * B13–B15 MVP release audit contracts (source-level).
 * Does not apply migrations or touch production.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

test("064 security hardening migration exists and is allowlisted", () => {
  const name = "064_mvp_release_security_hardening.sql";
  assert.equal(existsSync(resolve("supabase/migrations", name)), true);
  const sql = read(`supabase/migrations/${name}`);
  assert.match(sql, /v_past_due/);
  assert.match(sql, /RAISE EXCEPTION 'CONFIRM_PAYMENT_FAILED/);
  assert.match(sql, /account_type.*customer|'customer'/);
  assert.match(sql, /v_entity_ok/);
  assert.match(sql, /v_due_now/);
  const allow = read("scripts/migration-scope-allowlist.mjs");
  assert.match(allow, /064_mvp_release_security_hardening\.sql/);
});

test("organizer portal requires approved verification", () => {
  const auth = read("src/lib/organizer/auth.ts");
  assert.match(auth, /verificationStatus !== "approved"/);
});

test("customer signup hardcodes account_type customer", () => {
  const actions = read("src/lib/customer/auth-actions.ts");
  assert.match(actions, /account_type:\s*"customer"/);
  assert.doesNotMatch(actions, /account_type:\s*formData|account_type:\s*raw/);
});

test("confirm/fail payment remain service_role only in 063+064", () => {
  const sql063 = read("supabase/migrations/063_staging_payment_foundation.sql");
  const sql064 = read("supabase/migrations/064_mvp_release_security_hardening.sql");
  assert.match(sql063, /GRANT EXECUTE ON FUNCTION public\.confirm_payment_atomic/);
  assert.match(sql063, /TO service_role/);
  assert.match(sql064, /GRANT EXECUTE ON FUNCTION public\.confirm_payment_atomic/);
  assert.match(sql064, /TO service_role/);
  assert.match(sql064, /REVOKE ALL ON FUNCTION public\.confirm_payment_atomic[\s\S]*authenticated/);
});

test("robots disallow TR+EN private paths", () => {
  const robots = read("src/app/robots.ts");
  assert.match(robots, /\/\*\/odeme/);
  assert.match(robots, /\/\*\/hesap/);
  assert.match(robots, /\/\*\/giris/);
  assert.match(robots, /\/\*\/kayit/);
  assert.match(robots, /\/\*\/checkout/);
});

test("gitignore covers tsbuildinfo and ephemeral audit SQL", () => {
  const gi = read(".gitignore");
  assert.match(gi, /tsconfig\.tsbuildinfo/);
  assert.match(gi, /_audit_\*\.sql/);
});

test("payment amount source of truth remains ledger total_amount", () => {
  const service = read("src/lib/payments/service.ts");
  assert.match(service, /asNumber\(row\.total_amount\)|asNumber\(order\.total_amount\)/);
  assert.doesNotMatch(service, /NEXT_PUBLIC_IYZICO/);
});

test("discovery list statuses exclude draft lifecycle", () => {
  const queries = read("src/lib/data/supabase/queries.ts");
  assert.match(queries, /DISCOVERY_LIST_STATUSES\s*=\s*\["published",\s*"postponed"\]/);
});

test("protected migrations 058-060 remain present and untouched by 064 filename", () => {
  const migs = readdirSync(resolve("supabase/migrations"));
  assert.ok(migs.includes("058_staging_event_review_lifecycle.sql"));
  assert.ok(migs.includes("059_staging_set_event_official_ticket_url.sql"));
  assert.ok(migs.includes("060_staging_artist_write_rpcs.sql"));
  assert.ok(migs.includes("064_mvp_release_security_hardening.sql"));
});
