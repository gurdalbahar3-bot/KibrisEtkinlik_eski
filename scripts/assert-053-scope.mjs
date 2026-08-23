import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");
const migration034 = join(migrationsDir, "034_rls_rpc_indexes.sql");
const migration047 = join(migrationsDir, "047_event_core_metadata_setup.sql");
const migration049 = join(migrationsDir, "049_kktc_location_model.sql");
const migration051 = join(migrationsDir, "051_approval_audit.sql");
const migration052 = join(migrationsDir, "052_venue_create_lifecycle.sql");
const migration053 = join(migrationsDir, "053_create_event_atomic.sql");
const verification051 = join(root, "supabase/tests/051_approval_audit_verification.sql");
const verification052 = join(root, "supabase/tests/052_venue_create_lifecycle_verification.sql");
const verification053 = join(root, "supabase/tests/053_create_event_atomic_verification.sql");

function numberedMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, match: name.match(/^(\d{3})_/) }))
    .filter((row) => row.match)
    .map((row) => ({ name: row.name, n: Number(row.match[1]) }));
}

test("053 exists and 056+ stay out of this change", () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(files.includes("053_create_event_atomic.sql"), "053_create_event_atomic.sql must exist");
  assert.ok(files.includes("052_venue_create_lifecycle.sql"), "052 must remain");
  assert.ok(files.includes("051_approval_audit.sql"), "051 must remain");

  const numbered = numberedMigrations();
  assert.ok(
    numbered.every((row) => row.n <= 55),
    `unexpected 056+ migration: ${numbered.filter((row) => row.n >= 56).map((row) => row.name).join(", ")}`
  );
  assert.equal(
    numbered.filter((row) => row.n === 53).length,
    1,
    "exactly one 053 migration"
  );
});

test("001-052 migration files were not rewritten by 053", () => {
  const numbered = numberedMigrations();
  for (const row of numbered.filter((item) => item.n <= 52)) {
    const sql = readFileSync(join(migrationsDir, row.name), "utf8");
    assert.doesNotMatch(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i,
      `${row.name} must not define create_event_atomic`
    );
  }
});

test("034/047/049/051/052 stay outside 053 scope", () => {
  const sql034 = readFileSync(migration034, "utf8");
  assert.match(sql034, /CREATE POLICY events_insert_owner_draft ON public\.events/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.publish_event/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.postpone_event/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.reschedule_event/);

  const sql047 = readFileSync(migration047, "utf8");
  assert.match(sql047, /CREATE OR REPLACE FUNCTION public\.upsert_event_format_atomic/);
  assert.doesNotMatch(sql047, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);

  const sql049 = readFileSync(migration049, "utf8");
  assert.doesNotMatch(sql049, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);
  assert.doesNotMatch(sql049, /ADD\s+COLUMN\s+.*created_by/i);

  const sql051 = readFileSync(migration051, "utf8");
  assert.match(sql051, /CREATE OR REPLACE FUNCTION public\.approve_account_application/);
  assert.match(sql051, /CREATE TABLE public\.admin_audit_log/);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);

  const sql052 = readFileSync(migration052, "utf8");
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.create_venue_atomic/);
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.venue_owner_is_eligible/);
  assert.doesNotMatch(sql052, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);

  const verify051 = readFileSync(verification051, "utf8");
  assert.match(verify051, /no create_event\* RPC/);
  assert.match(verify051, /events_insert_owner_draft untouched/);

  const verify052 = readFileSync(verification052, "utf8");
  assert.match(verify052, /no create_event\* RPC/);
});

test("053 implements create_event_atomic without forbidden features", () => {
  const sql053 = readFileSync(migration053, "utf8");

  assert.match(sql053, /ALTER TABLE public\.events\s+ADD COLUMN IF NOT EXISTS created_by/s);
  assert.match(sql053, /SET created_by = owner_id/);
  assert.match(sql053, /ALTER COLUMN created_by SET NOT NULL/);

  assert.match(sql053, /CREATE OR REPLACE FUNCTION public\.event_owner_is_eligible/);
  assert.match(sql053, /CREATE OR REPLACE FUNCTION public\.create_event_atomic/);
  assert.match(sql053, /SECURITY DEFINER/);
  assert.match(sql053, /SET search_path = public/);
  assert.match(sql053, /'draft'/);
  assert.match(sql053, /created_by,\s*\n\s*venue_id/s);
  assert.match(sql053, /v_actor_id/);
  assert.match(sql053, /'EVENT_CREATED'/);
  assert.match(sql053, /'event'/);
  assert.match(sql053, /DROP POLICY IF EXISTS events_insert_owner_draft ON public\.events/);
  assert.match(sql053, /REVOKE INSERT ON TABLE public\.events FROM PUBLIC/);
  assert.match(sql053, /REVOKE INSERT ON TABLE public\.events FROM anon, authenticated/);
  assert.match(sql053, /GRANT EXECUTE ON FUNCTION public\.create_event_atomic/);
  assert.match(sql053, /events_update_owner_draft kept/);
  assert.match(sql053, /events_select_public/);

  assert.doesNotMatch(
    sql053,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(publish_event|postpone_event|reschedule_event)/i
  );
  assert.doesNotMatch(sql053, /official_ticket_url/i);
  assert.doesNotMatch(sql053, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_venue_atomic/i);
  assert.doesNotMatch(sql053, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.approve_account_application/i);
  assert.doesNotMatch(
    sql053,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(submit_event|approve_event|hide_event|unhide_event|archive_event)/i
  );
  assert.doesNotMatch(sql053, /upsert_event_format_atomic|upsert_event_location|upsert_event_venue_contact|upsert_wedding/i);
  assert.doesNotMatch(sql053, /INSERT\s+INTO\s+public\.artists/i);
  assert.doesNotMatch(sql053, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.\w*spider/i);

  assert.ok(
    readFileSync(verification053, "utf8").includes("t053_report"),
    "053 verification harness must exist"
  );
});
