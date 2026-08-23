import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");
const migration043 = join(migrationsDir, "043_venue_layout_rpcs.sql");
const migration051 = join(migrationsDir, "051_approval_audit.sql");
const migration052 = join(migrationsDir, "052_venue_create_lifecycle.sql");
const verification051 = join(root, "supabase/tests/051_approval_audit_verification.sql");
const verification052 = join(root, "supabase/tests/052_venue_create_lifecycle_verification.sql");

function numberedMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, match: name.match(/^(\d{3})_/) }))
    .filter((row) => row.match)
    .map((row) => ({ name: row.name, n: Number(row.match[1]) }));
}

test("052 exists and 054+ stay out of this change", () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(files.includes("052_venue_create_lifecycle.sql"), "052_venue_create_lifecycle.sql must exist");
  assert.ok(
    files.includes("051_approval_audit.sql"),
    "051_approval_audit.sql must remain"
  );

  const numbered = numberedMigrations();
  assert.ok(
    numbered.every((row) => row.n <= 53),
    `unexpected 054+ migration: ${numbered.filter((row) => row.n >= 54).map((row) => row.name).join(", ")}`
  );
  assert.equal(
    numbered.filter((row) => row.n === 52).length,
    1,
    "exactly one 052 migration"
  );
});

test("001-051 migration files were not rewritten by 052", () => {
  const numbered = numberedMigrations();
  for (const row of numbered.filter((item) => item.n <= 51)) {
    const sql = readFileSync(join(migrationsDir, row.name), "utf8");
    assert.doesNotMatch(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(create_venue_atomic|submit_venue_for_review|approve_venue|hide_venue|unhide_venue|archive_venue|can_manage_venue)/i,
      `${row.name} must not define 052 venue lifecycle RPCs`
    );
  }
});

test("051 approval/audit files stay unchanged in behavior markers", () => {
  const sql051 = readFileSync(migration051, "utf8");
  assert.match(sql051, /CREATE OR REPLACE FUNCTION public\.approve_account_application/);
  assert.match(sql051, /CREATE TABLE public\.admin_audit_log/);
  assert.match(sql051, /public\.is_super_admin\(\)/);
  assert.match(sql051, /public\.organization_memberships/);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_venue_atomic/i);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event/i);
  assert.doesNotMatch(sql051, /ADD\s+COLUMN\s+\w*official_ticket_url/i);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(publish_event|postpone_event|reschedule_event)/i);

  const verify051 = readFileSync(verification051, "utf8");
  assert.match(verify051, /approve_account_application/);
  assert.match(verify051, /admin_audit_log/);
});

test("043 layout schema/file is not rewritten; 052 wraps write RPCs", () => {
  const sql043 = readFileSync(migration043, "utf8");
  assert.match(sql043, /IF NOT \(public\.owns_venue\(p_venue_id\) OR public\.is_super_admin\(\)\)/);
  assert.doesNotMatch(sql043, /can_manage_venue/);
  assert.doesNotMatch(sql043, /VENUE_NOT_EDITABLE/);

  const sql052 = readFileSync(migration052, "utf8");
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.update_venue_layout_canvas_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.upsert_venue_area_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.upsert_venue_table_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.upsert_venue_seat_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.upsert_venue_layout_object_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.delete_venue_layout_object_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.save_venue_layout_batch_atomic/);
  assert.match(sql052, /venue_layout_assert_writable/);
  assert.match(sql052, /can_manage_venue/);
  assert.match(sql052, /VENUE_NOT_EDITABLE/);
});

test("052 implements venue create + lifecycle without forbidden features", () => {
  const sql052 = readFileSync(migration052, "utf8");

  assert.doesNotMatch(sql052, /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+status\b/i);
  assert.match(sql052, /ALTER TABLE public\.venues\s+ADD COLUMN IF NOT EXISTS created_by/s);
  assert.match(sql052, /status IN \('draft', 'in_review', 'active', 'hidden', 'archived'\)/);
  assert.match(sql052, /ALTER COLUMN status SET DEFAULT 'draft'/);

  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.create_venue_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.submit_venue_for_review/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.approve_venue/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.hide_venue/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.unhide_venue/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.archive_venue/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.can_manage_venue/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.update_venue_atomic/);

  assert.match(sql052, /'VENUE_CREATED'/);
  assert.match(sql052, /'VENUE_SUBMITTED'/);
  assert.match(sql052, /'VENUE_APPROVED'/);
  assert.match(sql052, /'VENUE_HIDDEN'/);
  assert.match(sql052, /'VENUE_UNHIDDEN'/);
  assert.match(sql052, /'VENUE_ARCHIVED'/);

  assert.match(sql052, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.venues FROM anon, authenticated/);
  assert.match(sql052, /venues_select_public/);
  assert.doesNotMatch(sql052, /DROP POLICY(?:\s+IF\s+EXISTS)?\s+venues_select_public/i);

  assert.doesNotMatch(sql052, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event/i);
  assert.doesNotMatch(sql052, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(publish_event|postpone_event|reschedule_event)/i);
  assert.doesNotMatch(sql052, /official_ticket_url/i);
  assert.doesNotMatch(sql052, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.approve_account_application/i);

  assert.ok(
    readFileSync(verification052, "utf8").includes("t052_report"),
    "052 verification harness must exist"
  );
});
