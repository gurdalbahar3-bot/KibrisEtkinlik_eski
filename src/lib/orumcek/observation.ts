import { createEvidence } from "@/lib/admin/intake/evidence";
import type { RawObservation } from "@/lib/orumcek/types";
import type { RawSpiderEvent, SpiderChannelKind } from "@/types/admin/raw-spider-event";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function observationToRawEvent(observation: RawObservation): RawSpiderEvent {
  return {
    ...observation.raw,
    sourceUrl: observation.sourceUrl || observation.raw.sourceUrl,
    publisherId: observation.publisherId,
    channelKind: observation.channelKind,
  };
}

export function createRawObservation(input: {
  id?: string;
  publisherId: string;
  channelId: string;
  channelKind: SpiderChannelKind;
  sourceUrl: string;
  raw: Omit<RawSpiderEvent, "sourceUrl" | "capturedAt" | "evidence"> &
    Partial<Pick<RawSpiderEvent, "sourceUrl" | "capturedAt" | "evidence">>;
  capturedAt?: string;
  jobId?: string;
}): RawObservation {
  const capturedAt = input.capturedAt ?? input.raw.capturedAt ?? new Date().toISOString();
  const sourceUrl = input.sourceUrl;
  const evidence =
    input.raw.evidence && input.raw.evidence.length > 0
      ? input.raw.evidence
      : [
          createEvidence(
            "HTML",
            sourceUrl,
            capturedAt,
            `${input.publisherId}:${input.raw.rawTitle}:${sourceUrl}`
          ),
        ];

  const raw: RawSpiderEvent = {
    ...input.raw,
    sourceUrl,
    capturedAt,
    evidence,
    publisherId: input.publisherId,
    channelKind: input.channelKind,
  };

  return {
    id: input.id ?? newId("obs"),
    publisherId: input.publisherId,
    channelId: input.channelId,
    channelKind: input.channelKind,
    sourceUrl,
    raw,
    capturedAt,
    jobId: input.jobId,
  };
}
