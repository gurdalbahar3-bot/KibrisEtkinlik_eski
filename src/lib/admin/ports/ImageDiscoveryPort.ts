import type { ImageCandidate } from "@/types/admin/image-candidate";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

/** Port for future image discovery (venue/official/local search) — mock only in FAZ 3.4. */
export interface ImageDiscoveryPort {
  discover(intake: DiscoveredEventIntake): Promise<ImageCandidate[]>;
}
