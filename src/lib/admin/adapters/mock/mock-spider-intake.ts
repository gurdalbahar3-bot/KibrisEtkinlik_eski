import { mapRawSpiderEventToIntake } from "@/lib/admin/intake/raw-to-intake";
import { createEvidence } from "@/lib/admin/intake/evidence";
import type { SpiderIntakePort } from "@/lib/admin/ports/SpiderIntakePort";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

const LEFKE_AKUSTIK_SAMPLE: RawSpiderEvent = {
  sourceUrl: "https://example.com/spider/mock/lefke-akustik-gece",
  rawTitle: "Lefke Akustik Gece",
  rawDescription: "Gemikonagi sahilinde akustik performans.",
  rawDate: "2026-08-20",
  rawTime: "20:00",
  rawVenue: "Gemikonagi Sahil",
  rawDistrict: "Lefke",
  rawCategory: "concert",
  rawArtist: "Local Acoustic Collective",
  capturedAt: "2026-08-17T10:00:00.000Z",
  evidence: [
    createEvidence(
      "HTML",
      "https://example.com/spider/mock/lefke-akustik-gece",
      "2026-08-17T10:00:00.000Z",
      "<html>Lefke Akustik Gece mock capture</html>",
      "ev-spider-lefke-html"
    ),
    createEvidence(
      "JSON",
      "https://example.com/spider/mock/lefke-akustik-gece.json",
      "2026-08-17T10:00:00.000Z",
      '{"title":"Lefke Akustik Gece","district":"Lefke"}',
      "ev-spider-lefke-json"
    ),
  ],
};

/** Mock spider adapter — produces raw intake only, no web crawling. */
export class MockSpiderIntakeAdapter implements SpiderIntakePort {
  async ingest(raw: RawSpiderEvent): Promise<DiscoveredEventIntake> {
    const input = mapRawSpiderEventToIntake(raw);
    return mockAdminIntakeRepository.create(input);
  }
}

export const mockSpiderIntakeAdapter = new MockSpiderIntakeAdapter();

export function getMockLefkeAkustikRawEvent(): RawSpiderEvent {
  return structuredClone(LEFKE_AKUSTIK_SAMPLE);
}

export async function ingestMockLefkeAkustikSample(): Promise<DiscoveredEventIntake> {
  return mockSpiderIntakeAdapter.ingest(getMockLefkeAkustikRawEvent());
}
