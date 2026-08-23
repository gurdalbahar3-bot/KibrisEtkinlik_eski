import type { IntakeStatus } from "@/types/admin/lifecycle";
import type { CorroborationDecision, MotorEvaluation, SpiderMotorStatus } from "@/lib/orumcek/types";

export const MOTOR_TRANSITIONS: Readonly<Record<SpiderMotorStatus, readonly SpiderMotorStatus[]>> = {
  DISCOVERED: ["AI_DRAFT"],
  AI_DRAFT: ["PENDING_APPROVAL", "REVIEW"],
  REVIEW: ["AI_DRAFT", "PENDING_APPROVAL"],
  PENDING_APPROVAL: ["AI_DRAFT", "REVIEW"],
};

const FORBIDDEN_ADMIN_STATUSES: readonly IntakeStatus[] = ["APPROVED", "PUBLISHED"];

export function canTransitionMotor(from: SpiderMotorStatus, to: SpiderMotorStatus): boolean {
  return MOTOR_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionMotor(
  from: SpiderMotorStatus,
  to: SpiderMotorStatus
): { ok: true; from: SpiderMotorStatus; to: SpiderMotorStatus } | { ok: false; message: string } {
  if (from === to) {
    return { ok: false, message: `Already in motor status ${to}.` };
  }
  if (!canTransitionMotor(from, to)) {
    return { ok: false, message: `Invalid motor transition: ${from} → ${to}.` };
  }
  return { ok: true, from, to };
}

export function destinationFromGate(
  decision: Pick<CorroborationDecision, "autoEligible">
): Extract<SpiderMotorStatus, "PENDING_APPROVAL" | "REVIEW"> {
  return decision.autoEligible ? "PENDING_APPROVAL" : "REVIEW";
}

export function mapMotorStatusToAdmin(status: SpiderMotorStatus): IntakeStatus {
  switch (status) {
    case "DISCOVERED":
      return "DISCOVERED";
    case "AI_DRAFT":
    case "REVIEW":
      return "AI_REVIEW";
    case "PENDING_APPROVAL":
      return "PENDING_APPROVAL";
  }
}

export function assertNotPublicCatalog(status: IntakeStatus): void {
  if (FORBIDDEN_ADMIN_STATUSES.includes(status)) {
    throw new Error("Örümcek motor must not land on APPROVED or PUBLISHED.");
  }
}

export function evaluationAdminStatus(
  motorStatus: MotorEvaluation["motorStatus"]
): MotorEvaluation["adminStatus"] {
  return mapMotorStatusToAdmin(motorStatus) as MotorEvaluation["adminStatus"];
}
