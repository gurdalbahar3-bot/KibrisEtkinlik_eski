import assert from "node:assert/strict";
import test from "node:test";

import { createEvidence } from "@/lib/admin/intake/evidence";
import { ingestRawSpiderEvent, inMemorySpiderIntakeAdapter } from "@/lib/orumcek/ingest";
import { FIXTURE_RAW_EVENTS, seedFixtureDrafts } from "@/lib/orumcek/fixtures";
import { listDrafts, listObservations, resetOrumcekStore } from "@/lib/orumcek/store";
import { applyDraftTransition } from "@/lib/orumcek/transitions";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

function sampleRaw(overrides: Partial<RawSpiderEvent> = {}): RawSpiderEvent {
  return {
    sourceUrl: "https://www.gisekibris.com/events/lefke-akustik-gece",
    rawTitle: "Lefke Akustik Gece",
    rawDescription: "Sahilde akustik performans.",
    rawDate: "2026-10-04",
    rawTime: "20:00",
    rawVenue: "Gemikonagi Sahil",
    rawDistrict: "Lefke",
    rawCategory: "concert",
    rawArtist: "Local Acoustic Collective",
    capturedAt: "2026-09-15T10:00:00.000Z",
    provenance: "FIXTURE",
    evidence: [
      createEvidence(
        "JSON",
        "https://www.gisekibris.com/events/lefke-akustik-gece",
        "2026-09-15T10:00:00.000Z",
        "fixture"
      ),
    ],
    ...overrides,
  };
}

test("ingest creates a draft in PENDING_APPROVAL or REVIEW and never writes public events", async () => {
  resetOrumcekStore();
  const result = await inMemorySpiderIntakeAdapter.ingest(sampleRaw());
  assert.equal(result.duplicate, false);
  assert.equal(result.wrotePublicEvent, false);
  assert.equal(result.draft.wrotePublicEvent, false);
  assert.ok(result.draft.status === "PENDING_APPROVAL" || result.draft.status === "REVIEW");
  assert.notEqual(result.draft.status, "PUBLISHED");
  assert.equal(result.draft.draft.title, "Lefke Akustik Gece");
  assert.equal(result.draft.draft.districtId, "lefke");
  assert.equal(result.draft.provenance, "FIXTURE");
});

test("same raw event is idempotent and does not duplicate drafts", () => {
  resetOrumcekStore();
  const first = ingestRawSpiderEvent(sampleRaw());
  const second = ingestRawSpiderEvent(sampleRaw());

  assert.equal(second.duplicate, true);
  assert.equal(second.duplicateReason, "observation");
  assert.equal(second.draft.id, first.draft.id);
  assert.equal(listDrafts().length, 1);
  assert.equal(listObservations().length, 1);
});

test("same identity from a second URL attaches without creating a second draft", () => {
  resetOrumcekStore();
  const first = ingestRawSpiderEvent(sampleRaw());
  const second = ingestRawSpiderEvent(
    sampleRaw({
      sourceUrl: "https://www.lefkebelediyesi.com/etkinlik/lefke-akustik-gece",
      capturedAt: "2026-09-15T11:00:00.000Z",
    })
  );

  assert.equal(second.duplicate, true);
  assert.equal(second.duplicateReason, "identity");
  assert.equal(second.draft.id, first.draft.id);
  assert.equal(listDrafts().length, 1);
  assert.equal(listObservations().length, 2);
  assert.equal(second.draft.observationIds.length, 2);
});

test("missing date lands in REVIEW", () => {
  resetOrumcekStore();
  const result = ingestRawSpiderEvent(
    sampleRaw({
      sourceUrl: "https://www.emu.edu.tr/events/undated",
      rawTitle: "DAÜ Bahar Konseri",
      rawDistrict: "Gazimagusa",
      rawDate: undefined,
      rawTime: undefined,
    })
  );
  assert.equal(result.draft.status, "REVIEW");
  assert.equal(result.draft.confidence.unsure, true);
  assert.ok(result.draft.confidence.reasons.some((reason) => /date/i.test(reason)));
});

test("approve marks APPROVED_READY and still does not write public events", () => {
  resetOrumcekStore();
  const ingested = ingestRawSpiderEvent(sampleRaw());
  const applied = applyDraftTransition(ingested.draft.id, "APPROVED_READY", {
    actor: "SUPER_ADMIN",
    actorId: "sa",
  });
  assert.equal(applied.ok, true);
  if (applied.ok) {
    assert.equal(applied.draft.status, "APPROVED_READY");
    assert.equal(applied.draft.wrotePublicEvent, false);
  }
  assert.ok(listDrafts().every((draft) => draft.wrotePublicEvent === false));
});

test("fixture seed is idempotent for the duplicate Gişe Kıbrıs capture", () => {
  resetOrumcekStore();
  const results = seedFixtureDrafts();
  const uniqueDrafts = new Set(results.map((item) => item.draft.id));
  assert.ok(uniqueDrafts.size < FIXTURE_RAW_EVENTS.length);
  assert.equal(listDrafts().length, uniqueDrafts.size);
  assert.ok(results.some((item) => item.duplicate));
});
