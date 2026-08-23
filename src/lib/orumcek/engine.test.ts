import { beforeEach, describe, expect, it } from "vitest";
import { resetMockAdminIntakeStore } from "@/lib/admin/repositories/mock-admin-intake-repository";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import { createOrumcekEngine, FrozenIntakeError } from "@/lib/orumcek/engine";
import { resetOrumcekStore } from "@/lib/orumcek/store";
import { fourIndependentObservations, observation } from "@/lib/orumcek/test-helpers";
import type { IntakeStatus } from "@/types/admin/lifecycle";

describe("OrumcekDiscoveryEngine ingest", () => {
  beforeEach(() => {
    resetOrumcekStore();
    resetMockAdminIntakeStore();
  });

  it("lands ingest as source SPIDER and status DISCOVERED without a public catalog write", async () => {
    const engine = createOrumcekEngine();
    const record = await engine.ingest(
      observation({
        publisherId: "venue-lefke",
        channelKind: "WEBSITE",
        title: "Orumcek Ingest Konseri",
      })
    );

    expect(record.status).toBe("DISCOVERED");
    expect(record.intakeId).toBeTruthy();

    const intake = mockAdminIntakeRepository.getById(record.intakeId!);
    expect(intake?.source).toBe("SPIDER");
    expect(intake?.status).toBe("DISCOVERED");
    expect(intake?.platformEventId).toBeUndefined();
    expect(intake?.publishedAt).toBeUndefined();
    expect(intake?.duplicateOf).toBeUndefined();
  });

  it("dedups ticket listings onto one intake record", async () => {
    const engine = createOrumcekEngine();
    const first = await engine.ingest(
      observation({
        publisherId: "venue-lefke",
        title: "Orumcek Dedup Konseri",
        sourceUrl: "https://venue-lefke.example/dedup",
      })
    );
    const second = await engine.ingest(
      observation({
        publisherId: "biletix",
        channelKind: "TICKET",
        publisherRole: "TICKET_AGGREGATOR",
        title: "Orumcek Dedup Konseri - Biletler",
        sourceUrl: "https://biletix.com/orumcek-dedup-biletler",
      })
    );

    expect(second.identity.id).toBe(first.identity.id);
    expect(second.intakeId).toBe(first.intakeId);
    expect(second.observations).toHaveLength(2);
    expect(mockAdminIntakeRepository.getById(first.intakeId!)?.duplicateOf).toBeUndefined();
  });

  it("collapses same title+district with a different date onto one identity", async () => {
    const engine = createOrumcekEngine();
    const first = await engine.ingest(
      observation({
        publisherId: "venue-lefke",
        title: "Orumcek Date Variant",
        date: "2026-08-20",
      })
    );
    const second = await engine.ingest(
      observation({
        publisherId: "gazete-kibris",
        title: "Orumcek Date Variant",
        date: "2026-08-22",
      })
    );

    expect(second.identity.id).toBe(first.identity.id);
    expect(second.intakeId).toBe(first.intakeId);
  });

  it("collapses same title+district with a different venue onto one identity", async () => {
    const engine = createOrumcekEngine();
    const first = await engine.ingest(
      observation({
        publisherId: "venue-lefke",
        title: "Orumcek Venue Variant",
        venue: "Gemikonagi Sahil",
      })
    );
    const second = await engine.ingest(
      observation({
        publisherId: "gazete-kibris",
        title: "Orumcek Venue Variant",
        venue: "Lefke Kultur Merkezi",
      })
    );

    expect(second.identity.id).toBe(first.identity.id);
    expect(second.intakeId).toBe(first.intakeId);
  });

  it("marks leftover mock intake-001 as duplicateOf for Lefke Akustik Gece", async () => {
    const engine = createOrumcekEngine();
    const record = await engine.ingest(
      observation({
        publisherId: "venue-lefke",
        title: "Lefke Akustik Gece",
        district: "Lefke",
      })
    );

    const intake = mockAdminIntakeRepository.getById(record.intakeId!);
    expect(intake?.duplicateOf).toBe("intake-001");
    expect(intake?.fingerprint).toBe("lefke akustik gece|lefke");
  });

  it("uses official transition() to AI_REVIEW and keeps autoEligible without skipping IMAGE_REVIEW", async () => {
    const engine = createOrumcekEngine();
    const [first, ...rest] = fourIndependentObservations({ title: "Orumcek Gate Konseri" });
    const ingested = await engine.ingest(first);
    for (const item of rest) {
      await engine.ingest(item);
    }

    const processed = await engine.process(ingested.identity.id);
    expect(processed.status).toBe("PENDING_APPROVAL");
    expect(processed.autoEligible).toBe(true);

    const intake = mockAdminIntakeRepository.getById(processed.intakeId!);
    expect(intake?.source).toBe("SPIDER");
    expect(intake?.status).toBe("AI_REVIEW");
    expect(intake?.autoEligible).toBe(true);
    expect(intake?.corroboration?.independentPublisherCount).toBe(4);
    expect(intake?.aiReview?.recommendation).toBe("PROCEED");
    expect(intake?.status).not.toBe("PENDING_APPROVAL");
    expect(intake?.status).not.toBe("APPROVED");
    expect(intake?.status).not.toBe("PUBLISHED");

    const history = mockAdminIntakeRepository.getHistory(processed.intakeId!);
    expect(
      history.some((entry) => entry.fromStatus === "DISCOVERED" && entry.toStatus === "AI_REVIEW")
    ).toBe(true);
  });

  it("maps contradiction to the existing AI_REVIEW queue even with 4 publishers", async () => {
    const engine = createOrumcekEngine();
    const agreed = fourIndependentObservations({
      title: "Orumcek Conflict Konseri",
      date: "2026-08-20",
    }).slice(0, 3);
    const conflict = observation({
      publisherId: "belediye-lefke",
      title: "Orumcek Conflict Konseri",
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

  it.each(["REJECTED", "APPROVED", "PUBLISHED"] as const)(
    "does not demote a %s intake on re-process",
    async (frozenStatus: IntakeStatus) => {
      const engine = createOrumcekEngine();
      const ingested = await engine.ingest(
        observation({
          publisherId: "venue-lefke",
          title: `Orumcek Frozen ${frozenStatus}`,
        })
      );

      const current = mockAdminIntakeRepository.getById(ingested.intakeId!);
      expect(current).toBeTruthy();
      mockAdminIntakeRepository.update({
        ...current!,
        status: frozenStatus,
      });

      await expect(engine.process(ingested.identity.id)).rejects.toBeInstanceOf(FrozenIntakeError);

      const after = mockAdminIntakeRepository.getById(ingested.intakeId!);
      expect(after?.status).toBe(frozenStatus);
      expect(after?.autoEligible).not.toBe(true);
    }
  );
});
