import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE,
  isDefaultPublishableStatus,
  parsePublishEventRpcResult,
  shouldShowPublishSuccess,
} from "../src/lib/admin/publish-event-result.ts";
import { assertPost055Allowlist } from "./migration-scope-allowlist.mjs";

const root = join(import.meta.dirname, "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const EVENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ID = "11111111-2222-3333-4444-555555555555";

test("post-055 migrations stay on project allowlist; app SQL does not rewrite publish_event", () => {
  const migrationsDir = join(root, "supabase/migrations");
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const numbered = files
    .map((name) => ({ name, match: name.match(/^(\d{3})_/) }))
    .filter((row) => row.match)
    .map((row) => ({ name: row.name, n: Number(row.match[1]) }));

  assertPost055Allowlist(numbered, assert);

  // App / non-migration sources must never ship CREATE OR REPLACE publish_event
  // (publish path is RPC-only via publish-event-action). Allowlisted staging
  // migrations may redefine publish_event only inside supabase/migrations/.
  const action = src("src/lib/admin/publish-event-action.ts");
  assert.doesNotMatch(action, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_event/i);
});

test("src does not CREATE OR REPLACE publish_event", () => {
  const action = src("src/lib/admin/publish-event-action.ts");
  assert.doesNotMatch(action, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_event/i);
  assert.match(action, /"publish_event"/);
});

test("mock adapter publish is not a live success path", () => {
  const adapterSrc = src("src/lib/admin/adapters/mock/mock-publishing.ts");
  assert.match(adapterSrc, /not a live publish path/);
  assert.doesNotMatch(adapterSrc, /mockAdminIntakeRepository\.transition/);
  assert.doesNotMatch(adapterSrc, /platformEventId/);
  assert.doesNotMatch(adapterSrc, /statusPublished|Yayınlandı/);
  assert.match(adapterSrc, /async publish\(/);
  assert.match(adapterSrc, /throw new Error/);
});

test("intake publish action cannot succeed via mock adapter", () => {
  const intakeActions = src("src/lib/admin/intake-actions.ts");
  assert.doesNotMatch(intakeActions, /mockPublishingAdapter\.publish/);
  assert.match(intakeActions, /Mock intake publish is disabled/);
});

test("publish_event RPC is the only live call site and sits after dev-cookie fail-closed", () => {
  const action = src("src/lib/admin/publish-event-action.ts");
  const fnStart = action.indexOf("export async function publishEventAction");
  const fnBody = action.slice(fnStart, action.indexOf("export async function publishEventFormAction"));
  const devIdx = fnBody.indexOf("if (shouldUseDevAdminAuth())");
  const rpcIdx = fnBody.indexOf(')("publish_event", rpcArgs)');
  assert.ok(devIdx >= 0, "dev cookie gate must exist");
  assert.ok(rpcIdx > devIdx, "publish_event must be after the dev cookie gate");
  assert.match(fnBody, /return \{ ok: false, message: DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE \}/);
  assert.match(fnBody, /isDefaultPublishableStatus/);
  const statusGuardIdx = fnBody.indexOf("isDefaultPublishableStatus");
  assert.ok(statusGuardIdx > devIdx && statusGuardIdx < rpcIdx, "default path must refuse non-approved/unpublished before RPC");
  assert.doesNotMatch(action, /mockPublishingAdapter/);
  assert.doesNotMatch(action, /can_manage_event/);
  assert.doesNotMatch(action, /eventsRepository|mockEventsRepository/);

  const otherTs = [
    "src/lib/admin/intake-actions.ts",
    "src/components/admin/PublishingQueue.tsx",
    "src/components/admin/PublishPreviewView.tsx",
    "src/components/admin/AdminEventDetailView.tsx",
    "src/lib/data/discovery-repository.ts",
  ];
  for (const file of otherTs) {
    assert.doesNotMatch(src(file), /["']publish_event["']/);
  }
});

test("admin publish UI binds to real events and not mock adapter success", () => {
  const queue = src("src/components/admin/PublishingQueue.tsx");
  const preview = src("src/components/admin/PublishPreviewView.tsx");
  const detail = src("src/components/admin/AdminEventDetailView.tsx");
  const form = src("src/components/admin/PublishEventForm.tsx");
  const publishingPage = src("src/app/admin/(control)/publishing/page.tsx");

  for (const body of [queue, preview, detail, form, publishingPage]) {
    assert.doesNotMatch(body, /mockPublishingAdapter/);
    assert.doesNotMatch(body, /publishIntakeFormAction/);
    assert.doesNotMatch(body, /mockAdminIntakeRepository/);
  }

  assert.match(form, /publishEventFormAction/);
  assert.match(publishingPage, /getAdminPublishableEvents/);
  assert.match(queue, /isDefaultPublishableStatus/);
  assert.match(detail, /isDefaultPublishableStatus/);
  assert.doesNotMatch(detail, /status === ["']draft["']/);
});

test("public discovery does not flip mock catalog to confirm publish", () => {
  const action = src("src/lib/admin/publish-event-action.ts");
  const discovery = src("src/lib/data/discovery-repository.ts");
  const config = src("src/lib/supabase/config.ts");

  assert.doesNotMatch(action, /mockEventsRepository/);
  assert.doesNotMatch(action, /mockAdminIntakeRepository/);
  assert.match(discovery, /isSupabaseDataSource\(\)/);
  assert.match(config, /PRODUCTION_DATA_SOURCE_ERROR/);
  assert.match(config, /return "mock"/);
});

test("parsePublishEventRpcResult requires success:true and a real matching event_id", () => {
  assert.equal(parsePublishEventRpcResult({ success: false, error_code: "FORBIDDEN" }, EVENT_ID).ok, false);
  assert.equal(
    parsePublishEventRpcResult({ success: true }, EVENT_ID).ok,
    false
  );
  assert.equal(
    parsePublishEventRpcResult({ success: true, event_id: "mock-platform-1" }, EVENT_ID).ok,
    false
  );
  assert.equal(
    parsePublishEventRpcResult({ success: true, event_id: OTHER_ID }, EVENT_ID).ok,
    false
  );
  const ok = parsePublishEventRpcResult(
    { success: true, event_id: EVENT_ID, status: "published" },
    EVENT_ID
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.eventId, EVENT_ID);
  }
});

test("UI success banner requires published status plus the RPC event_id", () => {
  assert.equal(
    shouldShowPublishSuccess({
      publishedQuery: EVENT_ID,
      eventId: EVENT_ID,
      eventStatus: "approved",
      publishErrorQuery: undefined,
    }),
    false
  );
  assert.equal(
    shouldShowPublishSuccess({
      publishedQuery: EVENT_ID,
      eventId: EVENT_ID,
      eventStatus: "published",
      publishErrorQuery: "publish_event failed: FORBIDDEN",
    }),
    false
  );
  assert.equal(
    shouldShowPublishSuccess({
      publishedQuery: "1",
      eventId: EVENT_ID,
      eventStatus: "published",
      publishErrorQuery: undefined,
    }),
    false
  );
  assert.equal(
    shouldShowPublishSuccess({
      publishedQuery: EVENT_ID,
      eventId: EVENT_ID,
      eventStatus: "published",
      publishErrorQuery: undefined,
    }),
    true
  );
});

test("default publish button is approved|unpublished only", () => {
  assert.equal(isDefaultPublishableStatus("approved"), true);
  assert.equal(isDefaultPublishableStatus("unpublished"), true);
  assert.equal(isDefaultPublishableStatus("draft"), false);
  assert.equal(isDefaultPublishableStatus("published"), false);
  assert.equal(isDefaultPublishableStatus("in_review"), false);
});

test("dev cookie blocked message is fail-closed and not a success label", () => {
  assert.match(DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE, /Dev cookie/);
  assert.doesNotMatch(DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE, /Yayınlandı/);
  assert.doesNotMatch(DEV_COOKIE_PUBLISH_BLOCKED_MESSAGE, /Published/);

  const feedback = src("src/components/admin/PublishFeedback.tsx");
  assert.match(feedback, /publishEventSuccess/);
  assert.match(feedback, /publishEventError/);
  const successIdx = feedback.indexOf("publishEventSuccess");
  const errorIdx = feedback.indexOf("if (error)");
  assert.ok(errorIdx >= 0 && errorIdx < successIdx, "error branch must run before success");
});
