import type { DistrictSlug, EventCategory } from "@/types/event";
import type { AIReviewResult } from "@/types/admin/ai-review";
import type { ImageCandidate } from "@/types/admin/image-candidate";
import type { IntakeStatus } from "@/types/admin/lifecycle";
import type { IntakeEvidence } from "@/types/admin/intake-evidence";

export type IntakeSource = "SPIDER" | "MANUAL" | "ORGANIZER_SUBMIT";

/** Independent-publisher corroboration attached by the Örümcek motor. */
export interface IntakeCorroboration {
  independentPublisherCount: number;
  threshold: number;
  met: boolean;
  publisherIds: string[];
}

export interface DiscoveredEventIntake {
  id: string;
  status: IntakeStatus;
  source: IntakeSource;
  sourceUrl?: string;
  rawTitle: string;
  rawDescription?: string;
  suggestedCategory?: EventCategory;
  suggestedDistrictId: DistrictSlug;
  suggestedVenueId?: string;
  suggestedStartsAt?: string;
  artist?: string;
  fingerprint?: string;
  /** Set when another intake shares the same fingerprint. */
  duplicateOf?: string;
  evidence: IntakeEvidence[];
  aiReview?: AIReviewResult;
  imageCandidates: ImageCandidate[];
  platformEventId?: string;
  officialTicketUrl?: string;
  /**
   * Motor flag: 4 independent publishers, no contradiction, not unsure.
   * Does not mean APPROVED or PUBLISHED.
   */
  autoEligible?: boolean;
  corroboration?: IntakeCorroboration;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Manual intake form payload — sourceUrl optional, manualNote becomes MANUAL_NOTE evidence. */
export interface ManualIntakeFormData {
  rawTitle: string;
  rawDescription?: string;
  sourceUrl?: string;
  suggestedDistrictId: DistrictSlug;
  suggestedVenueId?: string;
  suggestedCategory?: EventCategory;
  suggestedStartsAt: string;
  artist?: string;
  officialPosterUrl?: string;
  manualNote?: string;
}

export type CreateIntakeInput = Omit<
  DiscoveredEventIntake,
  "id" | "createdAt" | "updatedAt" | "evidence" | "imageCandidates" | "duplicateOf"
> & {
  evidence?: IntakeEvidence[];
  imageCandidates?: ImageCandidate[];
  duplicateOf?: string;
};
