import { transitionStatus } from "@/lib/admin/lifecycle/state-machine";
import { createIntakeFingerprint } from "@/lib/admin/intake/fingerprint";
import { normalizeEventTitle } from "@/lib/admin/intake/normalize";
import { INITIAL_MOCK_HISTORY, INITIAL_MOCK_INTAKES } from "@/lib/admin/mock/intake";
import type { AdminIntakeRepository } from "@/lib/admin/repositories/admin-intake-repository";
import type { CreateIntakeInput, DiscoveredEventIntake, IntakeSource } from "@/types/admin/intake";
import type { IntakeStatus, TransitionContext } from "@/types/admin/lifecycle";
import type { LifecycleTransition } from "@/types/admin/lifecycle-history";
import type { ImageCandidate } from "@/types/admin/image-candidate";

interface AdminIntakeStore {
  intakes: DiscoveredEventIntake[];
  history: LifecycleTransition[];
}

const STORE_KEY = Symbol.for("ged.adminIntakeStore");

function getStore(): AdminIntakeStore {
  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: AdminIntakeStore | undefined;
  };

  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = {
      intakes: structuredClone(INITIAL_MOCK_INTAKES),
      history: structuredClone(INITIAL_MOCK_HISTORY),
    };
  }

  return globalStore[STORE_KEY]!;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveFingerprint(input: CreateIntakeInput): string {
  if (input.fingerprint) {
    return input.fingerprint;
  }
  return createIntakeFingerprint({
    title: normalizeEventTitle(input.rawTitle),
    district: input.suggestedDistrictId,
    venue: input.suggestedVenueId,
    startsAt: input.suggestedStartsAt,
  });
}

function getIntakeFingerprint(intake: DiscoveredEventIntake): string {
  if (intake.fingerprint) {
    return intake.fingerprint;
  }
  return createIntakeFingerprint({
    title: normalizeEventTitle(intake.rawTitle),
    district: intake.suggestedDistrictId,
    venue: intake.suggestedVenueId,
    startsAt: intake.suggestedStartsAt,
  });
}

function findDuplicate(fingerprint: string): DiscoveredEventIntake | undefined {
  return getStore().intakes.find(
    (item) => !item.duplicateOf && getIntakeFingerprint(item) === fingerprint
  );
}

export const mockAdminIntakeRepository: AdminIntakeRepository = {
  getAll() {
    return structuredClone(getStore().intakes);
  },

  getById(id: string) {
    const intake = getStore().intakes.find((item) => item.id === id);
    return intake ? structuredClone(intake) : undefined;
  },

  getByStatus(status: IntakeStatus) {
    return structuredClone(getStore().intakes.filter((item) => item.status === status));
  },

  getBySource(source: IntakeSource) {
    return structuredClone(getStore().intakes.filter((item) => item.source === source));
  },

  getByFingerprint(fingerprint: string) {
    const match = getStore().intakes.find((item) => item.fingerprint === fingerprint);
    return match ? structuredClone(match) : undefined;
  },

  create(input: CreateIntakeInput) {
    const timestamp = new Date().toISOString();
    const fingerprint = resolveFingerprint(input);
    const existing = findDuplicate(fingerprint);

    const intake: DiscoveredEventIntake = {
      ...input,
      id: newId("intake"),
      fingerprint,
      duplicateOf: input.duplicateOf ?? existing?.id,
      evidence: input.evidence ?? [],
      imageCandidates: input.imageCandidates ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    getStore().intakes.unshift(intake);
    return structuredClone(intake);
  },

  update(intake: DiscoveredEventIntake) {
    const store = getStore();
    const index = store.intakes.findIndex((item) => item.id === intake.id);
    if (index === -1) {
      throw new Error(`Intake not found: ${intake.id}`);
    }

    const updated = { ...intake, updatedAt: new Date().toISOString() };
    store.intakes[index] = updated;
    return structuredClone(updated);
  },

  transition(id: string, targetStatus: IntakeStatus, context: TransitionContext) {
    const store = getStore();
    const index = store.intakes.findIndex((item) => item.id === id);
    if (index === -1) {
      return {
        intake: undefined as never,
        result: {
          ok: false as const,
          code: "INVALID_TRANSITION" as const,
          message: `Intake not found: ${id}`,
        },
      };
    }

    const current = store.intakes[index];
    const result = transitionStatus(current.status, targetStatus, context);

    if (!result.ok) {
      return { intake: structuredClone(current), result };
    }

    const updated: DiscoveredEventIntake = {
      ...current,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
    };

    store.intakes[index] = updated;

    const historyEntry: LifecycleTransition = {
      id: newId("hist"),
      entityId: id,
      fromStatus: result.from,
      toStatus: result.to,
      actorType: context.actor.type,
      actorId: context.actor.id,
      reason: context.reason,
      createdAt: updated.updatedAt,
    };
    store.history.unshift(historyEntry);

    return { intake: structuredClone(updated), result };
  },

  getHistory(entityId: string) {
    return structuredClone(
      getStore().history.filter((entry) => entry.entityId === entityId)
    );
  },

  countByStatus(status: IntakeStatus) {
    return getStore().intakes.filter((item) => item.status === status).length;
  },
};

export function updateMockImageCandidate(
  intakeId: string,
  candidate: ImageCandidate
): DiscoveredEventIntake | undefined {
  const store = getStore();
  const index = store.intakes.findIndex((item) => item.id === intakeId);
  if (index === -1) return undefined;

  const intake = store.intakes[index];
  const candidates = intake.imageCandidates.map((item) =>
    item.id === candidate.id ? candidate : item
  );
  const updated = {
    ...intake,
    imageCandidates: candidates,
    updatedAt: new Date().toISOString(),
  };
  store.intakes[index] = updated;
  return structuredClone(updated);
}

export function resetMockAdminIntakeStore(): void {
  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: AdminIntakeStore | undefined;
  };
  globalStore[STORE_KEY] = {
    intakes: structuredClone(INITIAL_MOCK_INTAKES),
    history: structuredClone(INITIAL_MOCK_HISTORY),
  };
}
