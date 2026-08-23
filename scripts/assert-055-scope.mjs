import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");
const migration034 = join(migrationsDir, "034_rls_rpc_indexes.sql");
const migration051 = join(migrationsDir, "051_approval_audit.sql");
const migration052 = join(migrationsDir, "052_venue_create_lifecycle.sql");
const migration053 = join(migrationsDir, "053_create_event_atomic.sql");
const migration054 = join(migrationsDir, "054_event_lifecycle.sql");
const migration055 = join(migrationsDir, "055_artist_official_ticket_url.sql");
const verification054 = join(root, "supabase/tests/054_event_lifecycle_verification.sql");
const verification055 = join(root, "supabase/tests/055_artist_official_ticket_url_verification.sql");

function numberedMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, match: name.match(/^(\d{3})_/) }))
    .filter((row) => row.match)
    .map((row) => ({ name: row.name, n: Number(row.match[1]) }));
}

test("055 exists and 056+ stay out of this change", () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(
    files.includes("055_artist_official_ticket_url.sql"),
    "055_artist_official_ticket_url.sql must exist"
  );
  assert.ok(files.includes("054_event_lifecycle.sql"), "054 must remain");
  assert.ok(files.includes("053_create_event_atomic.sql"), "053 must remain");
  assert.ok(files.includes("052_venue_create_lifecycle.sql"), "052 must remain");
  assert.ok(files.includes("051_approval_audit.sql"), "051 must remain");

  const numbered = numberedMigrations();
  assert.ok(
    numbered.every((row) => row.n <= 55),
    `unexpected 056+ migration: ${numbered.filter((row) => row.n >= 56).map((row) => row.name).join(", ")}`
  );
  assert.equal(
    numbered.filter((row) => row.n === 55).length,
    1,
    "exactly one 055 migration"
  );

  const testsDir = join(root, "supabase/tests");
  const testFiles = readdirSync(testsDir).filter((name) => name.endsWith(".sql"));
  assert.ok(
    testFiles.includes("055_artist_official_ticket_url_verification.sql"),
    "verification SQL must live in supabase/tests/"
  );
  assert.ok(
    !files.includes("055_artist_official_ticket_url_verification.sql"),
    "verification SQL must not live in supabase/migrations/"
  );
});

test("001-054 migration files were not rewritten by 055", () => {
  const numbered = numberedMigrations();
  for (const row of numbered.filter((item) => item.n <= 54)) {
    const sql = readFileSync(join(migrationsDir, row.name), "utf8");
    assert.doesNotMatch(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(upsert_artist_atomic|set_event_artists_atomic|set_event_official_ticket_url)/i,
      `${row.name} must not define 055 artist/URL RPCs`
    );
    assert.doesNotMatch(
      sql,
      /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+official_ticket_url/i,
      `${row.name} must not add official_ticket_url`
    );
  }
});

test("034/051/052/053/054 stay outside 055 file edits", () => {
  const sql034 = readFileSync(migration034, "utf8");
  assert.match(sql034, /CREATE POLICY artists_select_public ON public\.artists/);
  assert.match(sql034, /USING \(is_active = true OR public\.is_super_admin\(\)\)/);
  assert.match(sql034, /CREATE POLICY event_artists_select_public ON public\.event_artists/);
  assert.match(sql034, /CREATE POLICY events_update_owner_draft ON public\.events/);
  assert.match(sql034, /GRANT UPDATE \(\s*title, description, category, is_free, is_wedding,\s*cover_image_url, updated_at\s*\) ON public\.events/s);
  assert.doesNotMatch(sql034, /official_ticket_url/);
  assert.match(sql034, /CREATE OR REPLACE FUNCTION public\.publish_event/);

  const sql051 = readFileSync(migration051, "utf8");
  assert.match(sql051, /CREATE TABLE public\.admin_audit_log/);
  assert.doesNotMatch(sql051, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.upsert_artist_atomic/i);

  const sql052 = readFileSync(migration052, "utf8");
  assert.match(sql052, /CREATE OR REPLACE FUNCTION public\.hide_venue/);
  assert.doesNotMatch(sql052, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.upsert_artist_atomic/i);

  const sql053 = readFileSync(migration053, "utf8");
  assert.match(sql053, /CREATE OR REPLACE FUNCTION public\.create_event_atomic/);
  assert.doesNotMatch(sql053, /official_ticket_url/i);

  const sql054 = readFileSync(migration054, "utf8");
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.publish_event/);
  assert.match(sql054, /CREATE OR REPLACE FUNCTION public\.submit_event_for_review/);
  assert.doesNotMatch(sql054, /official_ticket_url/i);
  assert.doesNotMatch(sql054, /INSERT\s+INTO\s+public\.artists/i);

  assert.ok(
    readFileSync(verification054, "utf8").includes("t054_report"),
    "054 verification harness must remain"
  );
});

test("055 implements artist + official_ticket_url without forbidden features", () => {
  const sql055 = readFileSync(migration055, "utf8");

  assert.match(sql055, /ALTER TABLE public\.events\s+ADD COLUMN IF NOT EXISTS official_ticket_url text NULL/s);
  assert.match(sql055, /Empty string stores as NULL/);
  assert.match(sql055, /events_update_owner_draft GRANT list is unchanged — official_ticket_url is NOT added/);
  assert.match(sql055, /REVOKE UPDATE \(official_ticket_url\) ON TABLE public\.events/);

  assert.match(sql055, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.artists/);
  assert.match(sql055, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.event_artists/);

  assert.match(sql055, /DROP POLICY IF EXISTS artists_select_public ON public\.artists/);
  assert.match(sql055, /CREATE POLICY artists_select_public ON public\.artists/);
  assert.match(sql055, /event_is_published/);
  assert.match(sql055, /can_manage_event/);
  assert.match(sql055, /Do not treat artists\.is_active as the public event gate/);
  assert.doesNotMatch(sql055, /USING \(is_active = true OR public\.is_super_admin\(\)\)/);

  assert.match(sql055, /CREATE OR REPLACE FUNCTION public\.upsert_artist_atomic/);
  assert.match(sql055, /CREATE OR REPLACE FUNCTION public\.set_event_artists_atomic/);
  assert.match(sql055, /CREATE OR REPLACE FUNCTION public\.set_event_official_ticket_url/);
  assert.match(sql055, /SECURITY DEFINER/);
  assert.match(sql055, /SET search_path = public/);
  assert.match(sql055, /created_by/);
  assert.match(sql055, /is_super_admin\(\)/);
  assert.match(sql055, /can_manage_event\(p_event_id\)/);

  assert.match(sql055, /'ARTIST_UPSERTED'/);
  assert.match(sql055, /'EVENT_ARTISTS_UPDATED'/);
  assert.match(sql055, /'EVENT_OFFICIAL_TICKET_URL_SET'/);
  assert.doesNotMatch(sql055, /'EVENT_PUBLISHED'/);
  assert.doesNotMatch(sql055, /'EVENT_SUBMITTED'/);
  assert.doesNotMatch(sql055, /'EVENT_APPROVED'/);

  assert.match(sql055, /REVOKE ALL ON FUNCTION public\.upsert_artist_atomic\(text, text, text, text, boolean, uuid\)\s+FROM PUBLIC, anon/s);
  assert.match(sql055, /REVOKE ALL ON FUNCTION public\.set_event_artists_atomic\(uuid, jsonb\)\s+FROM PUBLIC, anon/s);
  assert.match(sql055, /REVOKE ALL ON FUNCTION public\.set_event_official_ticket_url\(uuid, text\)\s+FROM PUBLIC, anon/s);
  assert.match(sql055, /GRANT EXECUTE ON FUNCTION public\.upsert_artist_atomic\(text, text, text, text, boolean, uuid\)\s+TO authenticated/s);
  assert.match(sql055, /GRANT EXECUTE ON FUNCTION public\.set_event_artists_atomic\(uuid, jsonb\)\s+TO authenticated/s);
  assert.match(sql055, /GRANT EXECUTE ON FUNCTION public\.set_event_official_ticket_url\(uuid, text\)\s+TO authenticated/s);

  assert.match(sql055, /URL is NOT required to publish/);
  assert.match(sql055, /normalize_official_ticket_url/);
  assert.match(sql055, /localhost/);
  assert.match(sql055, /example\.com/);
  assert.match(sql055, /example\.org/);

  assert.doesNotMatch(sql055, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_event_atomic/i);
  assert.doesNotMatch(sql055, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_event/i);
  assert.doesNotMatch(
    sql055,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(submit_event_for_review|approve_event|unpublish_event|postpone_event|reschedule_event|cancel_event|complete_event|decide_event_change_request|propose_event_schedule_change)/i
  );
  assert.doesNotMatch(sql055, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_venue_atomic/i);
  assert.doesNotMatch(sql055, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.hide_venue/i);
  assert.doesNotMatch(sql055, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.approve_account_application/i);
  assert.doesNotMatch(sql055, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.\w*spider/i);
  assert.doesNotMatch(sql055, /qr_codes|payment_intents|organizer_os|venue_os|paytr|iyzico|sipay/i);
  assert.doesNotMatch(sql055, /GRANT UPDATE\s*\([^)]*official_ticket_url/i);
  assert.doesNotMatch(sql055, /CREATE POLICY \w+_(insert|update|delete)/i);

  assert.ok(
    readFileSync(verification055, "utf8").includes("t055_report"),
    "055 verification harness must exist"
  );
});
