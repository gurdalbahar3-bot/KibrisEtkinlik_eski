import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

/** Port for future real spider implementations — no crawling in FAZ 3.3. */
export interface SpiderIntakePort {
  ingest(raw: RawSpiderEvent): Promise<DiscoveredEventIntake>;
}
