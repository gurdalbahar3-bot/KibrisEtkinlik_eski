import type { ImageGenerationPort } from "@/lib/admin/ports/ImageGenerationPort";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { ImageCandidate } from "@/types/admin/image-candidate";

/** Mock AI image generation — no real API. Human approval always required. */
export class MockImageGenerationAdapter implements ImageGenerationPort {
  async generate(intake: DiscoveredEventIntake): Promise<ImageCandidate | null> {
    return {
      id: `img-gen-ai-${intake.id}`,
      eventIntakeId: intake.id,
      source: "AI",
      url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400",
      districtId: intake.suggestedDistrictId,
      aiJobId: `mock-ai-img-${intake.id}`,
      relevanceScore: 0.55,
      status: "PENDING",
      generatedByAi: true,
    };
  }
}

export const mockImageGenerationAdapter = new MockImageGenerationAdapter();
