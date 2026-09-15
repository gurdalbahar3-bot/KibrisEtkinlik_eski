import type { IntakeDraft, OrumcekStatus, SpiderObservation } from "@/lib/orumcek/types";

interface OrumcekStore {
  drafts: IntakeDraft[];
  observations: SpiderObservation[];
  fixturesSeeded: boolean;
}

const STORE_KEY = Symbol.for("ged.orumcekIntakeStore");

function getStore(): OrumcekStore {
  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: OrumcekStore | undefined;
  };

  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = {
      drafts: [],
      observations: [],
      fixturesSeeded: false,
    };
  }

  return globalStore[STORE_KEY]!;
}

export function resetOrumcekStore(): void {
  const store = getStore();
  store.drafts = [];
  store.observations = [];
  store.fixturesSeeded = false;
}

export function isOrumcekFixtureSeeded(): boolean {
  return getStore().fixturesSeeded;
}

export function markOrumcekFixturesSeeded(): void {
  getStore().fixturesSeeded = true;
}

export function listDrafts(): IntakeDraft[] {
  return structuredClone(getStore().drafts);
}

export function listObservations(): SpiderObservation[] {
  return structuredClone(getStore().observations);
}

export function getDraftById(id: string): IntakeDraft | undefined {
  const draft = getStore().drafts.find((item) => item.id === id);
  return draft ? structuredClone(draft) : undefined;
}

export function getObservationById(id: string): SpiderObservation | undefined {
  const observation = getStore().observations.find((item) => item.id === id);
  return observation ? structuredClone(observation) : undefined;
}

export function getObservationByKey(observationKey: string): SpiderObservation | undefined {
  const observation = getStore().observations.find((item) => item.observationKey === observationKey);
  return observation ? structuredClone(observation) : undefined;
}

export function getDraftByIdentityKey(identityKey: string): IntakeDraft | undefined {
  const draft = getStore().drafts.find((item) => item.identity.identityKey === identityKey);
  return draft ? structuredClone(draft) : undefined;
}

export function getDraftsByStatus(status: OrumcekStatus): IntakeDraft[] {
  return structuredClone(getStore().drafts.filter((item) => item.status === status));
}

export function countDraftsByStatus(status: OrumcekStatus): number {
  return getStore().drafts.filter((item) => item.status === status).length;
}

export function countQueueDrafts(): number {
  return getStore().drafts.filter(
    (item) => item.status === "PENDING_APPROVAL" || item.status === "REVIEW"
  ).length;
}

export function insertObservation(observation: SpiderObservation): SpiderObservation {
  getStore().observations.unshift(observation);
  return structuredClone(observation);
}

export function insertDraft(draft: IntakeDraft): IntakeDraft {
  getStore().drafts.unshift(draft);
  return structuredClone(draft);
}

export function replaceDraft(draft: IntakeDraft): IntakeDraft {
  const store = getStore();
  const index = store.drafts.findIndex((item) => item.id === draft.id);
  if (index === -1) {
    throw new Error(`Örümcek draft not found: ${draft.id}`);
  }
  const updated = { ...draft, updatedAt: new Date().toISOString() };
  store.drafts[index] = updated;
  return structuredClone(updated);
}

export function getObservationsForDraft(draft: IntakeDraft): SpiderObservation[] {
  const ids = new Set(draft.observationIds);
  return structuredClone(getStore().observations.filter((item) => ids.has(item.id)));
}
