import {
  normalizeIdentityDate,
  normalizeIdentityDistrict,
  normalizeIdentityTitle,
  normalizeIdentityVenue,
} from "@/lib/orumcek/identity";
import type { AIDraft, ConfidenceReport, ContradictionField, FieldContradiction, RawObservation } from "@/lib/orumcek/types";
import { normalizeCategorySlug } from "@/lib/admin/intake/normalize";

const UNSURE_SCORE_THRESHOLD = 0.7;

function uniqueNormalized(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (value) {
      seen.add(value);
    }
  }
  return [...seen];
}

function observationDate(observation: RawObservation): string | undefined {
  return normalizeIdentityDate(observation.raw.rawDate);
}

function collectContradictions(observations: RawObservation[]): FieldContradiction[] {
  const groups: Record<ContradictionField, string[]> = {
    title: uniqueNormalized(observations.map((item) => normalizeIdentityTitle(item.raw.rawTitle))),
    date: uniqueNormalized(observations.map((item) => observationDate(item))),
    venue: uniqueNormalized(observations.map((item) => normalizeIdentityVenue(item.raw.rawVenue))),
    district: uniqueNormalized(
      observations.map((item) =>
        item.raw.rawDistrict ? normalizeIdentityDistrict(item.raw.rawDistrict) : undefined
      )
    ),
    category: uniqueNormalized(
      observations.map((item) =>
        item.raw.rawCategory ? normalizeCategorySlug(item.raw.rawCategory) : undefined
      )
    ),
  };

  const contradictions: FieldContradiction[] = [];
  for (const [field, values] of Object.entries(groups) as Array<[ContradictionField, string[]]>) {
    if (values.length > 1) {
      contradictions.push({ field, values });
    }
  }
  return contradictions;
}

export function evaluateConfidence(
  observations: RawObservation[],
  draft?: AIDraft
): ConfidenceReport {
  const contradictions = collectContradictions(observations);
  const comparedFieldCount = 5;
  const agreed = comparedFieldCount - contradictions.length;
  const score = observations.length === 0 ? 0 : agreed / comparedFieldCount;

  const reasons: string[] = [];
  const missingDate =
    !draft?.startsAt && observations.every((item) => !normalizeIdentityDate(item.raw.rawDate));

  if (contradictions.length > 0) {
    reasons.push(
      `Contradictions on ${contradictions.map((item) => item.field).join(", ")}.`
    );
  }
  if (missingDate) {
    reasons.push("Date is missing.");
  }
  if (draft?.unsureFields.length) {
    reasons.push(`Draft is unsure about ${draft.unsureFields.join(", ")}.`);
  }
  if (score < UNSURE_SCORE_THRESHOLD && contradictions.length === 0 && !missingDate) {
    reasons.push("Agreement score is below the unsure threshold.");
  }

  const hasContradiction = contradictions.length > 0;
  const unsure =
    missingDate ||
    (draft?.unsureFields.length ?? 0) > 0 ||
    (score < UNSURE_SCORE_THRESHOLD && !hasContradiction);

  return {
    score,
    unsure,
    hasContradiction,
    contradictions,
    reasons,
  };
}
