import type { AIVerificationPort } from "@/lib/admin/ports/AIVerificationPort";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { AIReviewResult } from "@/types/admin/ai-review";

/** Deterministic mock AI verification — confidence is a hint only. */
export class MockAIVerificationAdapter implements AIVerificationPort {
  async verify(intake: DiscoveredEventIntake): Promise<AIReviewResult> {
    const flags: AIReviewResult["flags"] = [];

    if (!intake.suggestedStartsAt) {
      flags.push("DATE_UNCERTAIN");
    }
    if (intake.rawTitle.toLowerCase().includes("spam")) {
      flags.push("SPAM");
    }

    const districtMatch = Boolean(intake.suggestedDistrictId);
    const venueMatch = Boolean(intake.suggestedVenueId);

    let recommendation: AIReviewResult["recommendation"] = "PROCEED";
    if (flags.includes("SPAM")) {
      recommendation = "REJECT";
    } else if (flags.includes("DATE_UNCERTAIN") || !venueMatch) {
      recommendation = "NEEDS_HUMAN";
    }

    return {
      jobId: `mock-ai-${intake.id}`,
      confidence: districtMatch && venueMatch ? 0.85 : 0.62,
      categorySuggestion: intake.suggestedCategory,
      districtMatch,
      venueMatch,
      flags,
      recommendation,
    };
  }
}

export const mockAIVerificationAdapter = new MockAIVerificationAdapter();
