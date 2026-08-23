import { beforeEach, describe, expect, it } from "vitest";
import { resetMockAdminIntakeStore } from "@/lib/admin/repositories/mock-admin-intake-repository";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import { createOrumcekEngine } from "@/lib/orumcek/engine";
import { resetOrumcekStore } from "@/lib/orumcek/store";
import { fourIndependentObservations, observation } from "@/lib/orumcek/test-helpers";

describe("OrumcekDiscoveryEngine ingest", () => {
  beforeEach(() => {
    resetOrumcekStore();
    resetMockAdminIntakeStore();
  });

  it("lands ingest as source SPIDER and status DISCOVERED without a public catalog write", async () => {
    const engine = createOrumcekEngine();
    const record = await engine.ingest(
      observation({ publisherId: "venue-lefke", channelKind: "WEBSITE" })
    );

    expect(record.status).toBe("DISCOVERED");
    expect(record.intakeId).toBeTruthy();

    const intake = mockAdminIntakeRepository.getById(record.intakeId!);
    expect(intake?.source).toBe("SPIDER");
    expect(intake?.status).toBe("DISCOVERED");
    expect(intake?.platformEventId).toBeUndefined();
    expect(intake?.publishedAt).toBeUndefined();
  });

  it("dedups ticket listings onto one intake record", async () => {
    const engine = createOrumcekEngine();
    const first = await engine.ingest(
      observation({
        publisherId: "venue-lefke",
        title: "Lefke Akustik Gece",
        sourceUrl: "https://venue-lefke.example/akustik",
      })
    );
    const second = await engine.ingest(
      observation({
        publisherId: "biletix",
        channelKind: "TICKET",
        title: "Lefke Akustik Gece - Biletler",
        sourceUrl: "https://biletix.com/lefke-akustik-biletler",
      })
    );

    expect(second.identity.id).toBe(first.identity.id);
    expect(second.intakeId).toBe(first.intakeId);
    expect(second.observations).toHaveLength(2);

    const spiderIntakes = mockAdminIntakeRepository
      .getBySource("SPIDER")
      .filter((item) => item.id === first.intakeId || item.rawTitle.includes("Lefke Akustik"));
    const created = spiderIntakes.filter((item) => item.id === first.intakeId);
    expect(created).toHaveLength(1);
  });

  it("maps a 4-publisher agreement to PENDING_APPROVAL with autoEligible", async () => {
    const engine = createOrumcekEngine();
    const [first, ...rest] = fourIndependentObservations();
    const ingested = await engine.ingest(first);
    for (const item of rest) {
      await engine.ingest(item);
    }

    const processed = await engine.process(ingested.identity.id);
    expect(processed.status).toBe("PENDING_APPROVAL");
    expect(processed.autoEligible).toBe(true);

    const intake = mockAdminIntakeRepository.getById(processed.intakeId!);
    expect(intake?.source).toBe("SPIDER");
    expect(intake?.status).toBe("PENDING_APPROVAL");
    expect(intake?.autoEligible).toBe(true);
    expect(intake?.corroboration?.independentPublisherCount).toBe(4);
    expect(intake?.aiReview?.recommendation).toBe("PROCEED");
    expect(intake?.status).not.toBe("APPROVED");
    expect(intake?.status).not.toBe("PUBLISHED");
  });

  it("maps contradiction to the existing AI_REVIEW queue even with 4 publishers", async () => {
    const engine = createOrumcekEngine();
    const agreed = fourIndependentObservations({ date: "2026-08-20" }).slice(0, 3);
    const conflict = observation({
      publisherId: "belediye-lefke",
      date: "2026-08-21",
      sourceUrl: "https://example.com/belediye-lefke/event",
    });

    const ingested = await engine.ingest(agreed[0]);
    await engine.ingest(agreed[1]);
    await engine.ingest(agreed[2]);
    await engine.ingest(conflict);

    const processed = await engine.process(ingested.identity.id);
    expect(processed.status).toBe("REVIEW");
    expect(processed.autoEligible).toBe(false);

    const intake = mockAdminIntakeRepository.getById(processed.intakeId!);
    expect(intake?.status).toBe("AI_REVIEW");
    expect(intake?.autoEligible).toBe(false);
    expect(intake?.aiReview?.flags).toContain("CONTRADICTION");
    expect(intake?.aiReview?.recommendation).toBe("NEEDS_HUMAN");
  });
});
