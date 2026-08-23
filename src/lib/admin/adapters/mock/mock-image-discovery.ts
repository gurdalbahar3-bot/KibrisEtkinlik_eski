import type { ImageDiscoveryPort } from "@/lib/admin/ports/ImageDiscoveryPort";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { ImageCandidate } from "@/types/admin/image-candidate";

/** Mock image discovery — no web search. Returns deterministic local/venue candidates. */
export class MockImageDiscoveryAdapter implements ImageDiscoveryPort {
  async discover(intake: DiscoveredEventIntake): Promise<ImageCandidate[]> {
    const candidates: ImageCandidate[] = [];

    if (intake.suggestedVenueId) {
      candidates.push({
        id: `img-disc-venue-${intake.id}`,
        eventIntakeId: intake.id,
        source: "VENUE",
        url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400",
        districtId: intake.suggestedDistrictId,
        venueId: intake.suggestedVenueId,
        status: "PENDING",
      });
    }

    candidates.push({
      id: `img-disc-local-${intake.id}`,
      eventIntakeId: intake.id,
      source: "LOCAL",
      url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400",
      districtId: intake.suggestedDistrictId,
      status: "PENDING",
      relevanceScore: 0.7,
    });

    return candidates;
  }
}

export const mockImageDiscoveryAdapter = new MockImageDiscoveryAdapter();
