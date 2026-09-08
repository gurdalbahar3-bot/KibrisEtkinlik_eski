import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { assertPost055Allowlist } from "./migration-scope-allowlist.mjs";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");
const policyFile = join(migrationsDir, "034_rls_rpc_indexes.sql");
const migration051 = join(migrationsDir, "051_approval_audit.sql");

test("051 exists and 001-050 stay out of this change", () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(files.includes("051_approval_audit.sql"), "051_approval_audit.sql must exist");

  const numbered = files
    .map((name) => ({ name, match: name.match(/^(\d{3})_/) }))
    .filter((row) => row.match)
    .map((row) => ({ name: row.name, n: Number(row.match[1]) }));

  assert.ok(
    numbered.filter((row) => row.n <= 51).length >= 51,
    "migrations 001-051 must remain"
  );
  assertPost055Allowlist(numbered, assert);
});

test("events_insert_owner_draft remains in 034 and is not rewritten in 051", () => {
  const policySql = readFileSync(policyFile, "utf8");
  assert.match(policySql, /CREATE POLICY events_insert_owner_draft ON public\.events/);
  assert.match(policySql, /p\.verification_status = 'approved'/);

  const sql051 = readFileSync(migration051, "utf8");
  assert.doesNotMatch(sql051, /CREATE\s+(OR\s+REPLACE\s+)?POLICY\s+events_insert_owner_draft/i);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(publish_event|postpone_event|reschedule_event)/i);
});

test("051 does not add create_event* / create_venue_atomic / official_ticket_url", () => {
  const sql051 = readFileSync(migration051, "utf8");
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event/i);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_venue_atomic/i);
  assert.doesNotMatch(sql051, /ADD\s+COLUMN\s+\w*official_ticket_url/i);
  assert.match(sql051, /CREATE OR REPLACE FUNCTION public\.approve_account_application/);
  assert.match(sql051, /CREATE TABLE public\.admin_audit_log/);
  assert.match(sql051, /public\.is_super_admin\(\)/);
  assert.match(sql051, /public\.organization_memberships/);
});
