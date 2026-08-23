import { describe, expect, it } from "vitest";
import { stubAIDraftAdapter } from "@/lib/orumcek/ai-draft";
import { evaluateMotorDraft } from "@/lib/orumcek/evaluate";
import { fourIndependentObservations, observation } from "@/lib/orumcek/test-helpers";
import { INDEPENDENT_PUBLISHER_THRESHOLD } from "@/lib/orumcek/types";

describe("4-publisher corroboration gate", () => {
  it("requires 4 independent publishers before auto-eligibility", async () => {
    const three = fourIndependentObservations().slice(0, 3);
    const draft = await stubAIDraftAdapter.draft(three);
    const evaluation = evaluateMotorDraft(three, draft);

    expect(INDEPENDENT_PUBLISHER_THRESHOLD).toBe(4);
    expect(evaluation.corroboration.independentPublisherCount).toBe(3);
    expect(evaluation.corroboration.met).toBe(false);
    expect(evaluation.autoEligible).toBe(false);
    expect(evaluation.motorStatus).toBe("REVIEW");
    expect(evaluation.adminStatus).toBe("AI_REVIEW");
  });

  it("opens PENDING_APPROVAL when 4 publishers agree and nothing is unsure", async () => {
    const observations = fourIndependentObservations();
    const draft = await stubAIDraftAdapter.draft(observations);
    const evaluation = evaluateMotorDraft(observations, draft);

    expect(evaluation.corroboration.independentPublisherCount).toBe(4);
    expect(evaluation.corroboration.met).toBe(true);
    expect(evaluation.confidence.hasContradiction).toBe(false);
    expect(evaluation.confidence.unsure).toBe(false);
    expect(evaluation.autoEligible).toBe(true);
    expect(evaluation.motorStatus).toBe("PENDING_APPROVAL");
    expect(evaluation.adminStatus).toBe("PENDING_APPROVAL");
  });

  it("sends contradiction to REVIEW even if 4 independent publishers exist", async () => {
    const observations = [
      ...fourIndependentObservations({ date: "2026-08-20" }).slice(0, 3),
      observation({
        publisherId: "belediye-lefke",
        date: "2026-08-21",
        sourceUrl: "https://example.com/belediye-lefke/event",
      }),
    ];

    const draft = await stubAIDraftAdapter.draft(observations);
    const evaluation = evaluateMotorDraft(observations, draft);

    expect(evaluation.corroboration.independentPublisherCount).toBe(4);
    expect(evaluation.corroboration.met).toBe(true);
    expect(evaluation.confidence.hasContradiction).toBe(true);
    expect(evaluation.confidence.contradictions.some((item) => item.field === "date")).toBe(true);
    expect(evaluation.autoEligible).toBe(false);
    expect(evaluation.motorStatus).toBe("REVIEW");
    expect(evaluation.adminStatus).toBe("AI_REVIEW");
  });

  it("does not count same-publisher website + Instagram toward the 4-publisher gate", async () => {
    const observations = [
      observation({ publisherId: "venue-lefke", channelKind: "WEBSITE" }),
      observation({ publisherId: "venue-lefke", channelKind: "INSTAGRAM" }),
      observation({ publisherId: "gazete-kibris", channelKind: "WEBSITE" }),
      observation({ publisherId: "radyo-guzelyurt", channelKind: "WEBSITE" }),
    ];

    const draft = await stubAIDraftAdapter.draft(observations);
    const evaluation = evaluateMotorDraft(observations, draft);

    expect(evaluation.corroboration.independentPublisherCount).toBe(3);
    expect(evaluation.autoEligible).toBe(false);
    expect(evaluation.motorStatus).toBe("REVIEW");
  });
});
