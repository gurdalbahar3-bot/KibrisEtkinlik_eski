import type { EventCategory } from "@/types/event";

export type AIReviewFlag =
  | "SPAM"
  | "DUPLICATE"
  | "LOW_QUALITY"
  | "DATE_UNCERTAIN"
  | "CONTRADICTION"
  | "INSUFFICIENT_CORROBORATION"
  | "UNSURE";

export type AIReviewRecommendation = "PROCEED" | "REJECT" | "NEEDS_HUMAN";

export interface AIReviewResult {
  jobId: string;
  confidence: number;
  duplicateOf?: string;
  categorySuggestion?: EventCategory;
  districtMatch: boolean;
  venueMatch: boolean;
  flags: AIReviewFlag[];
  recommendation: AIReviewRecommendation;
}
