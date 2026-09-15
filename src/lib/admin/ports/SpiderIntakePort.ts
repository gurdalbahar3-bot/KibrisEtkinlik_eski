import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

/**
 * Intake-lab adapter used by the mock admin pipeline (DiscoveredEventIntake).
 * Sprint 1 Örümcek motor — separate in-memory drafts, never public `events` —
 * lives at `@/lib/orumcek` (`inMemorySpiderIntakeAdapter`).
 */
export interface SpiderIntakePort {
  ingest(raw: RawSpiderEvent): Promise<DiscoveredEventIntake>;
}
