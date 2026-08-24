import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_SECRET_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SA_E2E_EMAIL",
  "SA_E2E_PASSWORD",
];

function missingLiveJwtSecrets() {
  return REQUIRED_SECRET_KEYS.filter((key) => !process.env[key]?.trim());
}

export function liveJwtE2EGate(required, missing) {
  if (missing.length === 0) return "run";
  if (required) return "fail";
  return "skip";
}

test("JWT E2E gating matrix", () => {
  assert.equal(liveJwtE2EGate(false, ["SUPABASE_URL"]), "skip");
  assert.equal(liveJwtE2EGate(true, ["SA_E2E_PASSWORD"]), "fail");
  assert.equal(liveJwtE2EGate(false, []), "run");
  assert.equal(liveJwtE2EGate(true, []), "run");
});

test("live SA JWT publish_event E2E is gated on secrets", async (t) => {
  const required = process.env.REQUIRE_LIVE_JWT_E2E === "1";
  const missing = missingLiveJwtSecrets();
  const gate = liveJwtE2EGate(required, missing);

  if (gate === "fail") {
    assert.fail(
      `REQUIRE_LIVE_JWT_E2E=1 but secrets missing: ${missing.join(", ")}`
    );
  }

  if (gate === "skip") {
    t.skip("SKIPPED (credential unavailable)");
    return;
  }

  const url = process.env.SUPABASE_URL.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY.trim();
  const email = process.env.SA_E2E_EMAIL.trim();
  const password = process.env.SA_E2E_PASSWORD.trim();
  const requestedEventId = process.env.SA_E2E_EVENT_ID?.trim();

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  assert.equal(signInError, null, signInError?.message ?? "sign-in failed");
  assert.ok(session?.user?.id, "SA login must return a user");

  const { data: isSuperAdmin, error: saError } = await supabase.rpc("is_super_admin");
  assert.equal(saError, null, saError?.message ?? "is_super_admin failed");
  assert.equal(isSuperAdmin, true, "signed-in user must be Super Admin");

  let eventId = requestedEventId;
  if (!eventId) {
    const { data: rows, error: listError } = await supabase
      .from("events")
      .select("id, status")
      .in("status", ["approved", "unpublished"])
      .limit(1);
    assert.equal(listError, null, listError?.message ?? "list publishable events failed");
    eventId = rows?.[0]?.id;
  }

  assert.ok(eventId, "need an approved or unpublished event to publish");

  const { data: publishPayload, error: publishError } = await supabase.rpc("publish_event", {
    p_event_id: eventId,
  });
  assert.equal(publishError, null, publishError?.message ?? "publish_event RPC failed");
  assert.equal(publishPayload?.success, true, `publish_event payload ${JSON.stringify(publishPayload)}`);
  assert.equal(publishPayload?.event_id, eventId);

  const { data: publishedRow, error: statusError } = await supabase
    .from("events")
    .select("id, status")
    .eq("id", eventId)
    .maybeSingle();
  assert.equal(statusError, null, statusError?.message ?? "status re-read failed");
  assert.equal(publishedRow?.status, "published");

  await supabase.auth.signOut();

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: discovered, error: discoveryError } = await anon
    .from("events")
    .select("id, status")
    .eq("id", eventId)
    .maybeSingle();
  assert.equal(discoveryError, null, discoveryError?.message ?? "anon discovery failed");
  assert.equal(discovered?.id, eventId);
  assert.equal(discovered?.status, "published");
});
