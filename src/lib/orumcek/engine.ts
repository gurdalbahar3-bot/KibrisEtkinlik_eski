import { mockSpiderIntakeAdapter } from "@/lib/admin/adapters/mock/mock-spider-intake";
import type { AdminIntakeRepository } from "@/lib/admin/repositories/admin-intake-repository";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import type { SpiderIntakePort } from "@/lib/admin/ports/SpiderIntakePort";
import { stubAIDraftAdapter } from "@/lib/orumcek/ai-draft";
import { evaluateMotorDraft } from "@/lib/orumcek/evaluate";
import { applyMotorToIntake } from "@/lib/orumcek/mapper";
import { observationToRawEvent } from "@/lib/orumcek/observation";
import { canTransitionMotor } from "@/lib/orumcek/state-machine";
import {
  addObservation,
  attachObservationToMotor,
  createMotorForIdentity,
  getMotorByIdentityId,
  patchMotorRecord,
  resolveOrCreateIdentity,
  setMotorIntakeId,
  transitionMotorRecord,
} from "@/lib/orumcek/store";
import type { AIDraftPort, MotorRecord, RawObservation } from "@/lib/orumcek/types";

export interface OrumcekEngineDeps {
  spiderIntake: SpiderIntakePort;
  intakeRepo: AdminIntakeRepository;
  aiDraft: AIDraftPort;
}

/**
 * Domain/application motor. Calls SpiderIntakePort so ingest lands as
 * source SPIDER / DISCOVERED. Never writes the public catalog.
 */
export class OrumcekDiscoveryEngine {
  constructor(private readonly deps: OrumcekEngineDeps) {}

  async ingest(observation: RawObservation): Promise<MotorRecord> {
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
      if (intake) {
        this.deps.intakeRepo.update({
          ...intake,
          evidence: [...intake.evidence, ...observation.raw.evidence],
        });
      }
    }
    return attached;
  }

  async process(identityId: string): Promise<MotorRecord> {
    const current = getMotorByIdentityId(identityId);
    if (!current) {
      throw new Error(`Motor record not found for identity ${identityId}.`);
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
      const intake = this.deps.intakeRepo.getById(updated.intakeId);
      if (intake) {
        this.deps.intakeRepo.update(applyMotorToIntake(intake, updated));
      }
    }

    return updated;
  }

  async ingestAndProcess(observation: RawObservation): Promise<MotorRecord> {
    const ingested = await this.ingest(observation);
    return this.process(ingested.identity.id);
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
