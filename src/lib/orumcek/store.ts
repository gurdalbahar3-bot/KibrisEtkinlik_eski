import { createEventIdentity, findMatchingIdentity, identityKeyFromObservation } from "@/lib/orumcek/identity";
import { transitionMotor } from "@/lib/orumcek/state-machine";
import type {
  EventIdentity,
  MotorRecord,
  RawObservation,
  SourceSeed,
  SpiderJob,
  SpiderMotorStatus,
} from "@/lib/orumcek/types";

interface OrumcekStore {
  seeds: SourceSeed[];
  jobs: SpiderJob[];
  observations: RawObservation[];
  identities: EventIdentity[];
  motors: MotorRecord[];
}

const STORE_KEY = Symbol.for("ged.orumcekStore");

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getStore(): OrumcekStore {
  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: OrumcekStore | undefined;
  };
  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = {
      seeds: [],
      jobs: [],
      observations: [],
      identities: [],
      motors: [],
    };
  }
  return globalStore[STORE_KEY]!;
}

export function resetOrumcekStore(): void {
  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: OrumcekStore | undefined;
  };
  globalStore[STORE_KEY] = {
    seeds: [],
    jobs: [],
    observations: [],
    identities: [],
    motors: [],
  };
}

export function addSourceSeed(seed: SourceSeed): SourceSeed {
  getStore().seeds.push(seed);
  return seed;
}

export function addJob(job: SpiderJob): SpiderJob {
  getStore().jobs.push(job);
  return job;
}

export function updateJob(job: SpiderJob): SpiderJob {
  const store = getStore();
  const index = store.jobs.findIndex((item) => item.id === job.id);
  if (index === -1) {
    store.jobs.push(job);
  } else {
    store.jobs[index] = job;
  }
  return job;
}

export function addObservation(observation: RawObservation): RawObservation {
  const existing = getObservation(observation.id);
  if (existing) {
    return existing;
  }
  getStore().observations.push(observation);
  return observation;
}

export function getObservation(id: string): RawObservation | undefined {
  return getStore().observations.find((item) => item.id === id);
}

export function listIdentities(): EventIdentity[] {
  return getStore().identities;
}

export function getMotorByIdentityId(identityId: string): MotorRecord | undefined {
  return getStore().motors.find((item) => item.identity.id === identityId);
}

export function getMotorByIntakeId(intakeId: string): MotorRecord | undefined {
  return getStore().motors.find((item) => item.intakeId === intakeId);
}

export function getMotorByObservationId(observationId: string): MotorRecord | undefined {
  return getStore().motors.find(
    (item) =>
      item.observations.some((observation) => observation.id === observationId) ||
      item.identity.observationIds.includes(observationId)
  );
}

export function resolveOrCreateIdentity(observation: RawObservation): EventIdentity {
  const store = getStore();
  const existing = findMatchingIdentity(store.identities, observation);
  if (existing) {
    if (!existing.observationIds.includes(observation.id)) {
      existing.observationIds.push(observation.id);
    }
    return existing;
  }

  const identity = createEventIdentity(newId("identity"), observation);
  store.identities.push(identity);
  return identity;
}

export function createMotorForIdentity(
  identity: EventIdentity,
  observation: RawObservation
): MotorRecord {
  const timestamp = nowIso();
  const record: MotorRecord = {
    id: newId("motor"),
    status: "DISCOVERED",
    identity,
    observations: [observation],
    autoEligible: false,
    intakeId: identity.intakeId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getStore().motors.push(record);
  return record;
}

export function attachObservationToMotor(
  identityId: string,
  observation: RawObservation
): MotorRecord {
  const record = getMotorByIdentityId(identityId);
  if (!record) {
    throw new Error(`Motor record not found for identity ${identityId}.`);
  }
  if (record.observations.some((item) => item.id === observation.id)) {
    return record;
  }
  record.observations.push(observation);
  if (!record.identity.observationIds.includes(observation.id)) {
    record.identity.observationIds.push(observation.id);
  }
  record.updatedAt = nowIso();
  return record;
}

export function setMotorIntakeId(identityId: string, intakeId: string): MotorRecord {
  const record = getMotorByIdentityId(identityId);
  if (!record) {
    throw new Error(`Motor record not found for identity ${identityId}.`);
  }
  record.intakeId = intakeId;
  record.identity.intakeId = intakeId;
  record.updatedAt = nowIso();
  return record;
}

export function transitionMotorRecord(
  identityId: string,
  to: SpiderMotorStatus
): MotorRecord {
  const record = getMotorByIdentityId(identityId);
  if (!record) {
    throw new Error(`Motor record not found for identity ${identityId}.`);
  }
  const result = transitionMotor(record.status, to);
  if (!result.ok) {
    throw new Error(result.message);
  }
  record.status = to;
  record.updatedAt = nowIso();
  return record;
}

export function patchMotorRecord(
  identityId: string,
  patch: Partial<
    Pick<MotorRecord, "draft" | "confidence" | "corroboration" | "autoEligible" | "status">
  >
): MotorRecord {
  const record = getMotorByIdentityId(identityId);
  if (!record) {
    throw new Error(`Motor record not found for identity ${identityId}.`);
  }
  Object.assign(record, patch);
  record.updatedAt = nowIso();
  return record;
}

export function identityKeyOrThrow(observation: RawObservation): string {
  return identityKeyFromObservation(observation);
}
