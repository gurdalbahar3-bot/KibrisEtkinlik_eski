import type { AIReviewResult } from "@/types/admin/ai-review";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

/** Port for future real AI verification providers — no live AI in FAZ 3.4. */
export interface AIVerificationPort {
  verify(intake: DiscoveredEventIntake): Promise<AIReviewResult>;
}
