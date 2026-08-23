import type { AIReviewFlag, AIReviewResult } from "@/types/admin/ai-review";
import type { DiscoveredEventIntake, IntakeCorroboration } from "@/types/admin/intake";
import { assertNotPublicCatalog } from "@/lib/orumcek/state-machine";
import type { MotorRecord } from "@/lib/orumcek/types";

export function mapMotorToCorroboration(record: MotorRecord): IntakeCorroboration | undefined {
  if (!record.corroboration) {
    return undefined;
  }
  return {
    independentPublisherCount: record.corroboration.independentPublisherCount,
    threshold: record.corroboration.threshold,
    met: record.corroboration.met,
    publisherIds: record.corroboration.publisherIds,
  };
}

export function mapMotorToAIReview(record: MotorRecord): AIReviewResult | undefined {
  if (!record.confidence || !record.draft) {
    return undefined;
  }

  const flags: AIReviewFlag[] = [];
  if (record.confidence.hasContradiction) {
    flags.push("CONTRADICTION");
  }
  if (record.corroboration && !record.corroboration.met) {
    flags.push("INSUFFICIENT_CORROBORATION");
  }
  if (record.confidence.unsure) {
    flags.push("UNSURE");
  }
  if (!record.draft.startsAt) {
    flags.push("DATE_UNCERTAIN");
  }

  return {
    jobId: `orumcek-ai-${record.id}`,
    confidence: record.confidence.score,
    categorySuggestion: record.draft.category,
    districtMatch: Boolean(record.draft.districtId),
    venueMatch: Boolean(record.draft.venueId),
    flags,
    recommendation: record.autoEligible ? "PROCEED" : "NEEDS_HUMAN",
  };
}

/**
 * Maps motor draft/corroboration onto the existing admin intake DTO.
 * Does not change lifecycle status — that must go through transition().
 */
export function applyMotorToIntake(
  intake: DiscoveredEventIntake,
  record: MotorRecord
): DiscoveredEventIntake {
  assertNotPublicCatalog(intake.status);
  if (intake.status === "APPROVED" || intake.status === "PUBLISHED") {
    throw new Error("Örümcek motor must not overwrite APPROVED or PUBLISHED intake.");
  }

  return {
    ...intake,
    source: "SPIDER",
    rawTitle: record.draft?.title ?? intake.rawTitle,
    rawDescription: record.draft?.description ?? intake.rawDescription,
    suggestedCategory: record.draft?.category ?? intake.suggestedCategory,
    suggestedDistrictId: record.draft?.districtId ?? intake.suggestedDistrictId,
    suggestedVenueId: record.draft?.venueId ?? intake.suggestedVenueId,
    suggestedStartsAt: record.draft?.startsAt ?? intake.suggestedStartsAt,
    artist: record.draft?.artist ?? intake.artist,
    officialTicketUrl: record.draft?.officialTicketUrl ?? intake.officialTicketUrl,
    autoEligible: record.autoEligible,
    corroboration: mapMotorToCorroboration(record),
    aiReview: mapMotorToAIReview(record) ?? intake.aiReview,
  };
}
