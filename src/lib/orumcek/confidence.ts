import {
  normalizeIdentityDate,
  normalizeIdentityTitle,
  normalizeIdentityVenue,
  resolveCategory,
  tryResolveDistrict,
} from "@/lib/orumcek/identity";
import type {
  AIDraft,
  ConfidenceReport,
  ContradictionField,
  FieldContradiction,
  SpiderObservation,
} from "@/lib/orumcek/types";

export const UNSURE_SCORE_THRESHOLD = 0.7;

const EXPECTED_FIELDS: readonly ContradictionField[] = [
  "title",
  "date",
  "venue",
  "district",
  "category",
];

const REQUIRED_FIELDS: readonly ContradictionField[] = ["title", "district"];

function uniqueNormalized(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (value) {
      seen.add(value);
    }
  }
  return [...seen];
}

function fieldValues(observations: SpiderObservation[], field: ContradictionField): string[] {
  switch (field) {
    case "title":
      return uniqueNormalized(observations.map((item) => normalizeIdentityTitle(item.raw.rawTitle)));
    case "date":
      return uniqueNormalized(observations.map((item) => normalizeIdentityDate(item.raw.rawDate)));
    case "venue":
      return uniqueNormalized(observations.map((item) => normalizeIdentityVenue(item.raw.rawVenue)));
    case "district":
      return uniqueNormalized(observations.map((item) => tryResolveDistrict(item.raw.rawDistrict)));
    case "category":
      return uniqueNormalized(
        observations.map((item) => (item.raw.rawCategory ? resolveCategory(item.raw.rawCategory) : undefined))
      );
  }
}

function collectContradictions(observations: SpiderObservation[]): FieldContradiction[] {
  const contradictions: FieldContradiction[] = [];
  for (const field of EXPECTED_FIELDS) {
    const values = fieldValues(observations, field);
    if (values.length > 1) {
      contradictions.push({ field, values });
    }
  }
  return contradictions;
}

export function evaluateConfidence(
  observations: SpiderObservation[],
  draft?: AIDraft
): ConfidenceReport {
  const contradictions = collectContradictions(observations);
  const contradicted = new Set(contradictions.map((item) => item.field));
  let agreed = 0;
  const missingRequired: ContradictionField[] = [];

  for (const field of EXPECTED_FIELDS) {
    const values = fieldValues(observations, field);
    if (values.length === 1 && !contradicted.has(field)) {
      agreed += 1;
    }
    if (REQUIRED_FIELDS.includes(field) && values.length === 0) {
      missingRequired.push(field);
    }
  }

  const score = observations.length === 0 ? 0 : agreed / EXPECTED_FIELDS.length;
  const missingDate =
    !draft?.startsAt && observations.every((item) => !normalizeIdentityDate(item.raw.rawDate));
  const hasUnsureFields = (draft?.unsureFields.length ?? 0) > 0;
  const belowThreshold = score < UNSURE_SCORE_THRESHOLD;
  const hasMissingRequired = missingRequired.length > 0 || missingDate;

  const reasons: string[] = [];
  if (contradictions.length > 0) {
    reasons.push(`Contradictions on ${contradictions.map((item) => item.field).join(", ")}.`);
  }
  if (missingDate) {
    reasons.push("Date is missing.");
  }
  if (missingRequired.length > 0) {
    reasons.push(`Required fields missing: ${missingRequired.join(", ")}.`);
  }
  if (hasUnsureFields) {
    reasons.push(`Draft is unsure about ${draft?.unsureFields.join(", ")}.`);
  }
  if (belowThreshold) {
    reasons.push(`Agreement score ${score.toFixed(2)} is below ${UNSURE_SCORE_THRESHOLD}.`);
  }

  return {
    score,
    unsure: hasMissingRequired || hasUnsureFields || belowThreshold || contradictions.length > 0,
    hasContradiction: contradictions.length > 0,
    contradictions,
    reasons,
  };
}
