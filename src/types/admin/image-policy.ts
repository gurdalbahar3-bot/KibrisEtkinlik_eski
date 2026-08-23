import type { ImageCandidate } from "@/types/admin/image-candidate";

export type ImageSource = "OFFICIAL" | "VENUE" | "LOCAL" | "AI";

export type ImageBlockReason =
  | "DISTRICT_MISMATCH"
  | "INVALID_SOURCE"
  | "MISSING_DISTRICT"
  | "AI_REQUIRES_HUMAN"
  | "INVALID_URL";

export type ImagePolicyVerdict = "VALID" | "BLOCKED";

export const IMAGE_POLICY_PRIORITY: readonly ImageSource[] = [
  "OFFICIAL",
  "VENUE",
  "LOCAL",
  "AI",
] as const;

export interface ImagePolicyContext {
  eventDistrictId: string;
  imageDistrictId?: string;
  source: ImageSource;
  generatedByAi?: boolean;
}

export interface ImagePolicyResult {
  verdict: ImagePolicyVerdict;
  reason?: string;
}

export interface ImageCandidateEventContext {
  eventDistrictId: string;
  eventVenueId?: string;
}

export interface ImageCandidatePolicyResult {
  verdict: ImagePolicyVerdict;
  blockReason?: ImageBlockReason;
  reason?: string;
  requiresHumanApproval?: boolean;
}

const VALID_SOURCES: readonly ImageSource[] = ["OFFICIAL", "VENUE", "LOCAL", "AI"];

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Pure policy evaluation for a full image candidate + event context. */
export function evaluateImageCandidate(
  candidate: ImageCandidate,
  eventContext: ImageCandidateEventContext
): ImageCandidatePolicyResult {
  if (!candidate.url?.trim() || !isValidUrl(candidate.url.trim())) {
    return {
      verdict: "BLOCKED",
      blockReason: "INVALID_URL",
      reason: "Image URL is missing or invalid.",
    };
  }

  if (!VALID_SOURCES.includes(candidate.source)) {
    return {
      verdict: "BLOCKED",
      blockReason: "INVALID_SOURCE",
      reason: `Unsupported image source: ${candidate.source}.`,
    };
  }

  if (!candidate.districtId?.trim()) {
    return {
      verdict: "BLOCKED",
      blockReason: "MISSING_DISTRICT",
      reason: "Image district is required.",
    };
  }

  if (candidate.districtId !== eventContext.eventDistrictId) {
    return {
      verdict: "BLOCKED",
      blockReason: "DISTRICT_MISMATCH",
      reason: `District mismatch: event is in "${eventContext.eventDistrictId}" but image is tagged "${candidate.districtId}".`,
    };
  }

  if (candidate.source === "AI" || candidate.generatedByAi) {
    return {
      verdict: "VALID",
      blockReason: "AI_REQUIRES_HUMAN",
      requiresHumanApproval: true,
      reason: "AI-generated images require human approval and must never auto-publish.",
    };
  }

  return { verdict: "VALID" };
}

/** Legacy helper — delegates to evaluateImageCandidate semantics. */
export function evaluateImagePolicy(ctx: ImagePolicyContext): ImagePolicyResult {
  const result = evaluateImageCandidate(
    {
      id: "policy-check",
      eventIntakeId: "policy-check",
      source: ctx.source,
      url: "https://example.com/policy-check.jpg",
      districtId: ctx.imageDistrictId ?? ctx.eventDistrictId,
      status: "PENDING",
      generatedByAi: ctx.generatedByAi,
    },
    { eventDistrictId: ctx.eventDistrictId }
  );

  if (result.verdict === "BLOCKED") {
    return { verdict: "BLOCKED", reason: result.reason };
  }

  return { verdict: "VALID", reason: result.reason };
}

/** Example from product spec — Lefke event + non-Lefke image is always blocked. */
export const IMAGE_POLICY_EXAMPLE = {
  eventTitle: "Lefke Akustik Gece",
  eventDistrictId: "lefke",
  invalidImageDistrictId: "girne",
} as const;

export function isImageCandidateApprovable(
  candidate: ImageCandidate,
  eventContext: ImageCandidateEventContext
): boolean {
  return evaluateImageCandidate(candidate, eventContext).verdict === "VALID";
}
