import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");
const migration033 = join(migrationsDir, "033_triggers_validation_immutability.sql");
const migration034 = join(migrationsDir, "034_rls_rpc_indexes.sql");
const migration051 = join(migrationsDir, "051_approval_audit.sql");
const migration052 = join(migrationsDir, "052_venue_create_lifecycle.sql");
const migration053 = join(migrationsDir, "053_create_event_atomic.sql");
const migration054 = join(migrationsDir, "054_event_lifecycle.sql");
const verification053 = join(root, "supabase/tests/053_create_event_atomic_verification.sql");
const verification054 = join(root, "supabase/tests/054_event_lifecycle_verification.sql");

function numberedMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, match: name.match(/^(\d{3})_/) }))
    .filter((row) => row.match)
    .map((row) => ({ name: row.name, n: Number(row.match[1]) }));
}

test("054 exists and 055+ stay out of this change", () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(files.includes("054_event_lifecycle.sql"), "054_event_lifecycle.sql must exist");
  assert.ok(files.includes("053_create_event_atomic.sql"), "053 must remain");
  assert.ok(files.includes("052_venue_create_lifecycle.sql"), "052 must remain");
  assert.ok(files.includes("051_approval_audit.sql"), "051 must remain");

  const numbered = numberedMigrations();
  assert.ok(
    numbered.every((row) => row.n <= 54),
    `unexpected 055+ migration: ${numbered.filter((row) => row.n >= 55).map((row) => row.name).join(", ")}`
  );
  assert.equal(
    numbered.filter((row) => row.n === 54).length,
    1,
    "exactly one 054 migration"
  );

  const testsDir = join(root, "supabase/tests");
  const testFiles = readdirSync(testsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(
    testFiles.includes("054_event_lifecycle_verification.sql"),
    "verification SQL must live in supabase/tests/"
  );
  assert.ok(
    !files.includes("054_event_lifecycle_verification.sql"),
    "verification SQL must not live in supabase/migrations/"
  );
});

test("001-053 migration files were not rewritten by 054", () => {
  const numbered = numberedMigrations();
  for (const row of numbered.filter((item) => item.n <= 53)) {
    const sql = readFileSync(join(migrationsDir, row.name), "utf8");
    assert.doesNotMatch(
      sql,
      /CREATE\s+TABLE\s+public\.event_change_requests/i,
      `${row.name} must not create event_change_requests`
    );
    assert.doesNotMatch(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(submit_event_for_review|approve_event|unpublish_event|cancel_event|complete_event|propose_event_schedule_change|decide_event_change_request)/i,
      `${row.name} must not define 054 event lifecycle RPCs`
    );
  }
});

test("033/034/051/052/053 stay outside 054 file edits", () => {
  const sql033 = readFileSync(migration033, "utf8");
  assert.match(sql033, /CREATE OR REPLACE FUNCTION public\.trg_guard_events_status/);
  assert.match(sql033, /ARRAY\['published'\]/);
  assert.doesNotMatch(sql033, /ARRAY\['in_review', 'published'\]/);
  assert.doesNotMatch(sql033, /unpublished/);

  const sql034 = readFileSync(migration034, "utf8");
  assert.match(sql034, /CREATE TABLE public\.event_schedule_changes/);
  assert.match(sql034, /CREATE POLICY events_select_public ON public\.events/);
  assert.match(sql034, /status IN \('published', 'postponed', 'completed'\)/);
  assert.match(sql034, /CREATE POLICY events_update_owner_draft ON public\.events/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.publish_event/);
  assert.match(sql034, /IF NOT public\.can_manage_event\(p_event_id\)/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.postpone_event/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.reschedule_event/);

  const sql051 = readFileSync(migration051, "utf8");
  assert.match(sql051, /CREATE TABLE public\.admin_audit_log/);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_event/i);

  const sql052 = readFileSync(migration052, "utf8");
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.hide_venue/);
  assert.doesNotMatch(sql052, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);

  const sql053 = readFileSync(migration053, "utf8");
  assert.match(sql053, /CREATE OR REPLACE FUNCTION public\.create_event_atomic/);
  assert.match(sql053, /'draft'/);
  assert.doesNotMatch(
    sql053,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(publish_event|postpone_event|reschedule_event)/i
  );

  assert.ok(
    readFileSync(verification053, "utf8").includes("t053_report"),
    "053 verification harness must remain"
  );
});

test("054 implements event lifecycle without forbidden features", () => {
  const sql054 = readFileSync(migration054, "utf8");

  assert.match(sql054, /ALTER TYPE public\.event_status ADD VALUE IF NOT EXISTS 'in_review'/);
  assert.match(sql054, /ALTER TYPE public\.event_status ADD VALUE IF NOT EXISTS 'approved'/);
  assert.match(sql054, /ALTER TYPE public\.event_status ADD VALUE IF NOT EXISTS 'unpublished'/);
  assert.match(sql054, /Does NOT backfill events\.status/);
  assert.doesNotMatch(sql054, /DROP\s+TYPE\s+public\.event_status/i);
  assert.doesNotMatch(sql054, /RENAME\s+VALUE/i);

  assert.match(sql054, /CREATE TABLE public\.event_change_requests/);
  assert.match(sql054, /change_type IN \('postpone', 'reschedule'\)/);
  assert.match(sql054, /status IN \('pending', 'accepted', 'rejected'\)/);
  assert.doesNotMatch(sql054, /CREATE POLICY event_change_requests_insert_owner/);
  assert.match(sql054, /CREATE POLICY event_change_requests_select_own/);
  assert.doesNotMatch(sql054, /CREATE POLICY event_change_requests_\w*update/i);
  assert.doesNotMatch(sql054, /CREATE POLICY event_change_requests_\w*delete/i);
  assert.doesNotMatch(sql054, /ALTER TABLE public\.event_schedule_changes/i);

  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.trg_guard_events_status/);
  assert.match(sql054, /ARRAY\['in_review', 'published'\]/);
  assert.match(sql054, /ARRAY\['approved'\]/);
  assert.match(sql054, /ARRAY\['postponed', 'cancelled', 'completed', 'unpublished'\]/);
  assert.doesNotMatch(sql054, /CREATE TRIGGER trg_guard_events_status/);

  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.publish_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.postpone_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.reschedule_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.submit_event_for_review/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.approve_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.unpublish_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.cancel_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.complete_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.propose_event_schedule_change/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.decide_event_change_request/);
  assert.match(sql054, /SECURITY DEFINER/);
  assert.match(sql054, /SET search_path = public/);
  assert.match(sql054, /IF NOT public\.is_super_admin\(\)/);
  assert.match(sql054, /public\.can_manage_event\(p_event_id\)/);
  assert.match(sql054, /EVENT_PUBLISHED_EMERGENCY/);
  assert.match(sql054, /INSERT INTO public\.event_schedule_changes/);
  assert.match(sql054, /expire_order_atomic/);
  assert.match(sql054, /TICKET_ZONE_WITHOUT_TYPE/);
  assert.match(sql054, /SEAT_ZONE_WITHOUT_PRICING/);
  assert.match(sql054, /OWNER_NOT_ELIGIBLE/);

  assert.match(sql054, /'EVENT_SUBMITTED'/);
  assert.match(sql054, /'EVENT_APPROVED'/);
  assert.match(sql054, /'EVENT_PUBLISHED'/);
  assert.match(sql054, /'EVENT_UNPUBLISHED'/);
  assert.match(sql054, /'EVENT_CANCELLED'/);
  assert.match(sql054, /'EVENT_COMPLETED'/);
  assert.match(sql054, /'EVENT_POSTPONED'/);
  assert.match(sql054, /'EVENT_RESCHEDULED'/);
  assert.match(sql054, /'EVENT_CHANGE_PROPOSED'/);
  assert.match(sql054, /'EVENT_CHANGE_DECIDED'/);

  assert.match(sql054, /REVOKE ALL ON FUNCTION public\.publish_event\(uuid\) FROM PUBLIC, anon/);
  assert.match(sql054, /GRANT EXECUTE ON FUNCTION public\.submit_event_for_review\(uuid\) TO authenticated/);
  assert.match(sql054, /events_update_owner_draft stays status=draft only/);
  assert.match(sql054, /events_select_public stays published\|postponed\|completed/);
  assert.doesNotMatch(sql054, /DROP POLICY(?:\s+IF\s+EXISTS)?\s+events_select_public/i);
  assert.doesNotMatch(sql054, /DROP POLICY(?:\s+IF\s+EXISTS)?\s+events_update_owner_draft/i);
  assert.doesNotMatch(sql054, /GRANT UPDATE\s*\([^)]*status/i);
  assert.doesNotMatch(sql054, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);
  assert.doesNotMatch(sql054, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_venue_atomic/i);
  assert.doesNotMatch(sql054, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.hide_venue/i);
  assert.doesNotMatch(sql054, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.approve_account_application/i);
  assert.doesNotMatch(sql054, /official_ticket_url/i);
  assert.doesNotMatch(sql054, /INSERT\s+INTO\s+public\.artists/i);
  assert.doesNotMatch(sql054, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.\w*spider/i);
  assert.doesNotMatch(sql054, /qr_codes|payment_intents|organizer_os|venue_os/i);

  assert.ok(
    readFileSync(verification054, "utf8").includes("t054_report"),
    "054 verification harness must exist"
  );
});
