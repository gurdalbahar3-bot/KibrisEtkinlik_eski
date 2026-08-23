import { evaluateConfidence } from "@/lib/orumcek/confidence";
import { evaluateCorroborationFromObservations } from "@/lib/orumcek/corroboration";
import { destinationFromGate, evaluationAdminStatus } from "@/lib/orumcek/state-machine";
import type { AIDraft, MotorEvaluation, RawObservation } from "@/lib/orumcek/types";

export function evaluateMotorDraft(
  observations: RawObservation[],
  draft: AIDraft
): MotorEvaluation {
  const confidence = evaluateConfidence(observations, draft);
  const corroboration = evaluateCorroborationFromObservations(observations, {
    hasContradiction: confidence.hasContradiction,
    unsure: confidence.unsure,
  });
  const motorStatus = destinationFromGate(corroboration);

  return {
    draft,
    confidence,
    corroboration,
    motorStatus,
    adminStatus: evaluationAdminStatus(motorStatus),
    autoEligible: corroboration.autoEligible,
  };
}
