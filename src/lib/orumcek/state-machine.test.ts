import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionMotor,
  destinationFromConfidence,
  isPublishForbidden,
  transitionMotor,
} from "@/lib/orumcek/state-machine";
import { applyDraftTransition } from "@/lib/orumcek/transitions";
import { ingestRawSpiderEvent } from "@/lib/orumcek/ingest";
import { resetOrumcekStore } from "@/lib/orumcek/store";
import { createEvidence } from "@/lib/admin/intake/evidence";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

function sampleRaw(overrides: Partial<RawSpiderEvent> = {}): RawSpiderEvent {
  return {
    sourceUrl: "https://www.gisekibris.com/events/test",
    rawTitle: "Lefke Akustik Gece",
    rawDate: "2026-10-04",
    rawTime: "20:00",
    rawVenue: "Gemikonagi Sahil",
    rawDistrict: "Lefke",
    rawCategory: "concert",
    capturedAt: "2026-09-15T10:00:00.000Z",
    provenance: "FIXTURE",
    evidence: [
      createEvidence("JSON", "https://www.gisekibris.com/events/test", "2026-09-15T10:00:00.000Z", "fixture"),
    ],
    ...overrides,
  };
}

test("SYSTEM may advance DISCOVERED → AI_DRAFT → PENDING_APPROVAL|REVIEW", () => {
  const toDraft = transitionMotor("DISCOVERED", "AI_DRAFT", { actor: "SYSTEM" });
  assert.equal(toDraft.ok, true);

  const toPending = transitionMotor("AI_DRAFT", "PENDING_APPROVAL", { actor: "SYSTEM" });
  assert.equal(toPending.ok, true);

  const toReview = transitionMotor("AI_DRAFT", "REVIEW", { actor: "SYSTEM" });
  assert.equal(toReview.ok, true);
});

test("SYSTEM cannot approve or reject", () => {
  const approve = transitionMotor("PENDING_APPROVAL", "APPROVED_READY", { actor: "SYSTEM" });
  assert.equal(approve.ok, false);
  if (!approve.ok) {
    assert.equal(approve.code, "ACTOR_NOT_ALLOWED");
  }

  const reject = transitionMotor("PENDING_APPROVAL", "REJECTED", {
    actor: "SYSTEM",
    reason: "nope",
  });
  assert.equal(reject.ok, false);
});

test("SUPER_ADMIN can approve from REVIEW as well as PENDING_APPROVAL", () => {
  const fromReview = transitionMotor("REVIEW", "APPROVED_READY", {
    actor: "SUPER_ADMIN",
    actorId: "sa-1",
  });
  assert.equal(fromReview.ok, true);

  const approve = transitionMotor("PENDING_APPROVAL", "APPROVED_READY", {
    actor: "SUPER_ADMIN",
    actorId: "sa-1",
  });
  assert.equal(approve.ok, true);
  if (approve.ok) {
    assert.equal(approve.to, "APPROVED_READY");
    assert.notEqual(approve.to, "PUBLISHED");
  }

  assert.equal(canTransitionMotor("APPROVED_READY", "PUBLISHED" as never), false);
  assert.equal(isPublishForbidden("PUBLISHED"), true);
  assert.equal(isPublishForbidden("APPROVED"), true);
});

test("reject requires a reason", () => {
  const missing = transitionMotor("REVIEW", "REJECTED", { actor: "SUPER_ADMIN" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.code, "REASON_REQUIRED");
  }

  const ok = transitionMotor("REVIEW", "REJECTED", {
    actor: "SUPER_ADMIN",
    reason: "Spam / duplicate listing",
  });
  assert.equal(ok.ok, true);
});

test("REVIEW is the destination when confidence is unsure", () => {
  assert.equal(destinationFromConfidence(true), "REVIEW");
  assert.equal(destinationFromConfidence(false), "PENDING_APPROVAL");
});

test("applyDraftTransition records SA approval without writing a public event", () => {
  resetOrumcekStore();
  const ingested = ingestRawSpiderEvent(sampleRaw());
  assert.equal(ingested.draft.status, "PENDING_APPROVAL");

  const applied = applyDraftTransition(ingested.draft.id, "APPROVED_READY", {
    actor: "SUPER_ADMIN",
    actorId: "dev-super-admin",
  });
  assert.equal(applied.ok, true);
  if (applied.ok) {
    assert.equal(applied.draft.status, "APPROVED_READY");
    assert.equal(applied.draft.wrotePublicEvent, false);
    assert.equal(applied.draft.approvedBy, "dev-super-admin");
  }
});
