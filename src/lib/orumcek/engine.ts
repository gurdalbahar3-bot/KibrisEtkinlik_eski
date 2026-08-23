import { mockSpiderIntakeAdapter } from "@/lib/admin/adapters/mock/mock-spider-intake";
import type { AdminIntakeRepository } from "@/lib/admin/repositories/admin-intake-repository";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import type { SpiderIntakePort } from "@/lib/admin/ports/SpiderIntakePort";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { IntakeStatus } from "@/types/admin/lifecycle";
import { stubAIDraftAdapter } from "@/lib/orumcek/ai-draft";
import { evaluateMotorDraft } from "@/lib/orumcek/evaluate";
import { applyMotorToIntake } from "@/lib/orumcek/mapper";
import { observationToRawEvent } from "@/lib/orumcek/observation";
import { canTransitionMotor, isFrozenHumanStatus } from "@/lib/orumcek/state-machine";
import {
  addObservation,
  attachObservationToMotor,
  createMotorForIdentity,
  getMotorByIdentityId,
  getMotorByObservationId,
  getObservation,
  patchMotorRecord,
  resolveOrCreateIdentity,
  setMotorIntakeId,
  transitionMotorRecord,
} from "@/lib/orumcek/store";
import type { AIDraftPort, MotorRecord, RawObservation } from "@/lib/orumcek/types";

const MOTOR_ACTOR = { type: "SYSTEM" as const, id: "orumcek-motor" };

export class FrozenIntakeError extends Error {
  readonly status: IntakeStatus;

  constructor(status: IntakeStatus) {
    super(`Örümcek motor refuses to re-process ${status} intake.`);
    this.name = "FrozenIntakeError";
    this.status = status;
  }
}

export interface OrumcekEngineDeps {
  spiderIntake: SpiderIntakePort;
  intakeRepo: AdminIntakeRepository;
  aiDraft: AIDraftPort;
}

function appendEvidence(
  intake: DiscoveredEventIntake,
  observation: RawObservation
): DiscoveredEventIntake {
  return {
    ...intake,
    evidence: [...intake.evidence, ...observation.raw.evidence],
  };
}

/**
 * Domain/application motor. Calls SpiderIntakePort so ingest lands as
 * source SPIDER / DISCOVERED. Status changes go through intakeRepo.transition().
 */
export class OrumcekDiscoveryEngine {
  constructor(private readonly deps: OrumcekEngineDeps) {}

  async ingest(observation: RawObservation): Promise<MotorRecord> {
    // Same observation.id is a retry: do not append evidence or rewrite the motor.
    const alreadySeen = getObservation(observation.id);
    if (alreadySeen) {
      const existingMotor = getMotorByObservationId(observation.id);
      if (existingMotor) {
        return existingMotor;
      }
    }

    addObservation(observation);
    const identity = resolveOrCreateIdentity(observation);
    const existing = getMotorByIdentityId(identity.id);

    if (!existing) {
      const intake = await this.deps.spiderIntake.ingest(observationToRawEvent(observation));
      if (intake.source !== "SPIDER") {
        throw new Error("Spider ingest must land as source SPIDER.");
      }
      if (intake.status !== "DISCOVERED") {
        throw new Error("Spider ingest must land as status DISCOVERED.");
      }
      if (intake.platformEventId) {
        throw new Error("Spider ingest must not write a public catalog event id.");
      }
      identity.intakeId = intake.id;
      createMotorForIdentity(identity, observation);
      return setMotorIntakeId(identity.id, intake.id);
    }

    const attached = attachObservationToMotor(identity.id, observation);
    if (attached.intakeId) {
      const intake = this.deps.intakeRepo.getById(attached.intakeId);
      if (intake && !isFrozenHumanStatus(intake.status)) {
        this.deps.intakeRepo.update(appendEvidence(intake, observation));
      }
    }
    return attached;
  }

  async process(identityId: string): Promise<MotorRecord> {
    const current = getMotorByIdentityId(identityId);
    if (!current) {
      throw new Error(`Motor record not found for identity ${identityId}.`);
    }

    if (current.intakeId) {
      const intake = this.deps.intakeRepo.getById(current.intakeId);
      if (intake && isFrozenHumanStatus(intake.status)) {
        throw new FrozenIntakeError(intake.status);
      }
    }

    if (current.status === "DISCOVERED") {
      transitionMotorRecord(identityId, "AI_DRAFT");
    } else if (canTransitionMotor(current.status, "AI_DRAFT")) {
      transitionMotorRecord(identityId, "AI_DRAFT");
    }

    const drafting = getMotorByIdentityId(identityId);
    if (!drafting) {
      throw new Error(`Motor record missing after AI_DRAFT transition: ${identityId}.`);
    }

    const draft = await this.deps.aiDraft.draft(drafting.observations);
    const evaluation = evaluateMotorDraft(drafting.observations, draft);

    if (drafting.status !== evaluation.motorStatus) {
      transitionMotorRecord(identityId, evaluation.motorStatus);
    }

    const updated = patchMotorRecord(identityId, {
      draft: evaluation.draft,
      confidence: evaluation.confidence,
      corroboration: evaluation.corroboration,
      autoEligible: evaluation.autoEligible,
    });

    if (updated.intakeId) {
      this.syncAdminIntake(updated.intakeId, updated);
    }

    return updated;
  }

  async ingestAndProcess(observation: RawObservation): Promise<MotorRecord> {
    const ingested = await this.ingest(observation);
    return this.process(ingested.identity.id);
  }

  private syncAdminIntake(intakeId: string, record: MotorRecord): void {
    const intake = this.deps.intakeRepo.getById(intakeId);
    if (!intake) {
      return;
    }
    if (isFrozenHumanStatus(intake.status)) {
      throw new FrozenIntakeError(intake.status);
    }

    let current = intake;
    if (current.status === "DISCOVERED") {
      const { intake: transitioned, result } = this.deps.intakeRepo.transition(
        intakeId,
        "AI_REVIEW",
        { actor: MOTOR_ACTOR }
      );
      if (!result.ok) {
        throw new Error(result.message);
      }
      current = transitioned;
    }

    const mapped = applyMotorToIntake(current, record);
    if (mapped.status !== current.status) {
      throw new Error("Örümcek motor must not change admin status via update().");
    }
    this.deps.intakeRepo.update(mapped);
  }
}

export function createOrumcekEngine(
  deps?: Partial<OrumcekEngineDeps>
): OrumcekDiscoveryEngine {
  return new OrumcekDiscoveryEngine({
    spiderIntake: deps?.spiderIntake ?? mockSpiderIntakeAdapter,
    intakeRepo: deps?.intakeRepo ?? mockAdminIntakeRepository,
    aiDraft: deps?.aiDraft ?? stubAIDraftAdapter,
  });
}
