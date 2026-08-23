import type { ImageCandidate } from "@/types/admin/image-candidate";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

/** Port for future AI image generation — mock only in FAZ 3.4. */
export interface ImageGenerationPort {
  generate(intake: DiscoveredEventIntake): Promise<ImageCandidate | null>;
}
