import { describe, expect, it } from "vitest";
import {
  assertNotPublicCatalog,
  canTransitionMotor,
  destinationFromGate,
  mapMotorStatusToAdmin,
  transitionMotor,
} from "@/lib/orumcek/state-machine";

describe("orumcek motor state machine", () => {
  it("advances DISCOVERED → AI_DRAFT → PENDING_APPROVAL | REVIEW", () => {
    expect(canTransitionMotor("DISCOVERED", "AI_DRAFT")).toBe(true);
    expect(canTransitionMotor("AI_DRAFT", "PENDING_APPROVAL")).toBe(true);
    expect(canTransitionMotor("AI_DRAFT", "REVIEW")).toBe(true);
    expect(transitionMotor("DISCOVERED", "PENDING_APPROVAL").ok).toBe(false);
    expect(canTransitionMotor("DISCOVERED", "APPROVED" as never)).toBe(false);
  });

  it("maps onto admin statuses without APPROVED or PUBLISHED", () => {
    expect(mapMotorStatusToAdmin("DISCOVERED")).toBe("DISCOVERED");
    expect(mapMotorStatusToAdmin("AI_DRAFT")).toBe("AI_REVIEW");
    expect(mapMotorStatusToAdmin("REVIEW")).toBe("AI_REVIEW");
    expect(mapMotorStatusToAdmin("PENDING_APPROVAL")).toBe("PENDING_APPROVAL");
    expect(destinationFromGate({ autoEligible: true })).toBe("PENDING_APPROVAL");
    expect(destinationFromGate({ autoEligible: false })).toBe("REVIEW");

    expect(() => assertNotPublicCatalog("APPROVED")).toThrow(/must not land/);
    expect(() => assertNotPublicCatalog("PUBLISHED")).toThrow(/must not land/);
    expect(() => assertNotPublicCatalog("PENDING_APPROVAL")).not.toThrow();
  });
});
