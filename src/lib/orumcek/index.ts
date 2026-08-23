export { INDEPENDENT_PUBLISHER_THRESHOLD, SPIDER_MOTOR_STATUSES } from "@/lib/orumcek/types";
export type {
  AIDraft,
  AIDraftPort,
  ConfidenceReport,
  CorroborationDecision,
  EventIdentity,
  MotorEvaluation,
  MotorRecord,
  Publisher,
  PublisherChannel,
  RawObservation,
  SourceSeed,
  SpiderFetchPort,
  SpiderJob,
  SpiderJobStatus,
  SpiderMotorStatus,
} from "@/lib/orumcek/types";

export {
  countIndependentPublishers,
  createPublisher,
  createPublisherChannel,
  createSourceSeed,
  uniquePublisherIds,
} from "@/lib/orumcek/publisher";

export {
  buildIdentityKey,
  createEventIdentity,
  findMatchingIdentity,
  identityKeyFromObservation,
  normalizeIdentityTitle,
} from "@/lib/orumcek/identity";

export { evaluateConfidence } from "@/lib/orumcek/confidence";
export {
  evaluateCorroboration,
  evaluateCorroborationFromObservations,
} from "@/lib/orumcek/corroboration";
export { evaluateMotorDraft } from "@/lib/orumcek/evaluate";

export {
  MOTOR_TRANSITIONS,
  assertNotPublicCatalog,
  canTransitionMotor,
  destinationFromGate,
  mapMotorStatusToAdmin,
  transitionMotor,
} from "@/lib/orumcek/state-machine";

export { StubAIDraftAdapter, stubAIDraftAdapter } from "@/lib/orumcek/ai-draft";
export {
  StubSpiderFetchAdapter,
  createSpiderJob,
  markJobDone,
  markJobFailed,
  markJobRunning,
  runStubSpiderJob,
} from "@/lib/orumcek/jobs";
export { applyMotorToIntake, mapMotorToAIReview } from "@/lib/orumcek/mapper";
export { createRawObservation, observationToRawEvent } from "@/lib/orumcek/observation";
export { OrumcekDiscoveryEngine, createOrumcekEngine } from "@/lib/orumcek/engine";
export { resetOrumcekStore } from "@/lib/orumcek/store";
