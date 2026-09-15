import { createEvidence } from "@/lib/admin/intake/evidence";
import { buildStubDraft } from "@/lib/orumcek/ai-draft";
import { evaluateConfidence } from "@/lib/orumcek/confidence";
import {
  identityKeyFromRaw,
  normalizeIdentityDate,
  normalizeIdentityTitle,
  observationKeyFromRaw,
  resolveDistrictOrThrow,
} from "@/lib/orumcek/identity";
import { destinationFromConfidence, transitionMotor } from "@/lib/orumcek/state-machine";
import { matchSourceSeed } from "@/lib/orumcek/sources";
import {
  getDraftByIdentityKey,
  getObservationByKey,
  getObservationsForDraft,
  insertDraft,
  insertObservation,
  replaceDraft,
} from "@/lib/orumcek/store";
import type {
  EventIdentity,
  IntakeDraft,
  SpiderIngestResult,
  SpiderIntakePort,
  SpiderObservation,
} from "@/lib/orumcek/types";
import type { RawSpiderEvent, SpiderCaptureProvenance } from "@/types/admin/raw-spider-event";

const SYSTEM_ACTOR = { actor: "SYSTEM" as const, actorId: "orumcek-intake" };

function provenanceOf(raw: RawSpiderEvent): SpiderCaptureProvenance {
  return raw.provenance === "LIVE_CRAWL" ? "LIVE_CRAWL" : "FIXTURE";
}

function mergeProvenance(
  current: SpiderCaptureProvenance,
  incoming: SpiderCaptureProvenance
): SpiderCaptureProvenance {
  return current === "LIVE_CRAWL" || incoming === "LIVE_CRAWL" ? "LIVE_CRAWL" : "FIXTURE";
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateRawSpiderEvent(raw: RawSpiderEvent): void {
  if (!raw.sourceUrl?.trim()) {
    throw new Error("Spider intake requires sourceUrl.");
  }
  if (!raw.rawTitle?.trim()) {
    throw new Error("Spider intake requires rawTitle.");
  }
  resolveDistrictOrThrow(raw.rawDistrict);
}

function withEvidence(raw: RawSpiderEvent): RawSpiderEvent {
  if (raw.evidence.length > 0) {
    return raw;
  }
  return {
    ...raw,
    evidence: [
      createEvidence(
        "JSON",
        raw.sourceUrl,
        raw.capturedAt,
        JSON.stringify({ title: raw.rawTitle, date: raw.rawDate, venue: raw.rawVenue })
      ),
    ],
  };
}

function createObservation(raw: RawSpiderEvent): SpiderObservation {
  const source = matchSourceSeed(raw.sourceUrl);
  return {
    id: newId("obs"),
    observationKey: observationKeyFromRaw(raw),
    sourceSeedId: source?.id,
    sourceUrl: raw.sourceUrl.trim(),
    raw,
    capturedAt: raw.capturedAt,
    evidence: raw.evidence,
    provenance: provenanceOf(raw),
    crawlRunId: raw.crawlRunId,
  };
}

function createIdentity(raw: RawSpiderEvent, observationId: string): EventIdentity {
  const district = resolveDistrictOrThrow(raw.rawDistrict);
  return {
    id: newId("ident"),
    identityKey: identityKeyFromRaw(raw),
    titleNormalized: normalizeIdentityTitle(raw.rawTitle),
    district,
    dateKey: normalizeIdentityDate(raw.rawDate) ?? "undated",
    observationIds: [observationId],
  };
}

function advanceFromDiscovered(draft: IntakeDraft, observations: SpiderObservation[]): IntakeDraft {
  const toDraft = transitionMotor(draft.status, "AI_DRAFT", SYSTEM_ACTOR);
  if (!toDraft.ok) {
    throw new Error(toDraft.message);
  }

  const stub = buildStubDraft(observations);
  const confidence = evaluateConfidence(observations, stub);
  const next = destinationFromConfidence(confidence.unsure);
  const toQueue = transitionMotor("AI_DRAFT", next, SYSTEM_ACTOR);
  if (!toQueue.ok) {
    throw new Error(toQueue.message);
  }

  return {
    ...draft,
    status: next,
    draft: stub,
    confidence,
    wrotePublicEvent: false,
  };
}

function createDraft(observation: SpiderObservation): IntakeDraft {
  const identity = createIdentity(observation.raw, observation.id);
  const timestamp = observation.capturedAt;
  const discovered: IntakeDraft = {
    id: newId("draft"),
    status: "DISCOVERED",
    identity,
    observationIds: [observation.id],
    sourceSeedId: observation.sourceSeedId,
    sourceUrl: observation.sourceUrl,
    draft: { unsureFields: [] },
    confidence: {
      score: 0,
      unsure: true,
      hasContradiction: false,
      contradictions: [],
      reasons: ["Awaiting stub draft."],
    },
    provenance: observation.provenance,
    crawlRunId: observation.crawlRunId,
    wrotePublicEvent: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return advanceFromDiscovered(discovered, [observation]);
}

/**
 * Identity/dedup + stub AI draft + confidence. Never writes public `events`.
 * Same observation key or same identity key does not create a second draft.
 */
export function ingestRawSpiderEvent(rawInput: RawSpiderEvent): SpiderIngestResult {
  const raw = withEvidence(rawInput);
  validateRawSpiderEvent(raw);

  const observationKey = observationKeyFromRaw(raw);
  const existingObservation = getObservationByKey(observationKey);
  if (existingObservation) {
    const draft = getDraftByIdentityKey(identityKeyFromRaw(raw));
    if (!draft) {
      throw new Error("Orphan observation without draft.");
    }
    return {
      draft,
      observation: existingObservation,
      duplicate: true,
      duplicateReason: "observation",
      wrotePublicEvent: false,
    };
  }

  const identityKey = identityKeyFromRaw(raw);
  const existingDraft = getDraftByIdentityKey(identityKey);
  const observation = insertObservation(createObservation(raw));

  if (existingDraft) {
    const observationIds = [...existingDraft.observationIds, observation.id];
    const attached: IntakeDraft = {
      ...existingDraft,
      observationIds,
      identity: {
        ...existingDraft.identity,
        observationIds,
      },
      provenance: mergeProvenance(existingDraft.provenance, observation.provenance),
      crawlRunId: observation.crawlRunId ?? existingDraft.crawlRunId,
      wrotePublicEvent: false,
    };

    const frozen = existingDraft.status === "APPROVED_READY" || existingDraft.status === "REJECTED";
    if (!frozen) {
      const observations = getObservationsForDraft(attached);
      attached.draft = buildStubDraft(observations);
      attached.confidence = evaluateConfidence(observations, attached.draft);
    }

    const saved = replaceDraft(attached);
    return {
      draft: saved,
      observation,
      duplicate: true,
      duplicateReason: "identity",
      wrotePublicEvent: false,
    };
  }

  const created = insertDraft(createDraft(observation));
  return {
    draft: created,
    observation,
    duplicate: false,
    wrotePublicEvent: false,
  };
}

export class InMemorySpiderIntakeAdapter implements SpiderIntakePort {
  async ingest(raw: RawSpiderEvent): Promise<SpiderIngestResult> {
    return ingestRawSpiderEvent(raw);
  }
}

export const inMemorySpiderIntakeAdapter = new InMemorySpiderIntakeAdapter();
