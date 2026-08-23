import type { CreateIntakeInput, DiscoveredEventIntake, IntakeSource } from "@/types/admin/intake";
import type { IntakeStatus, TransitionContext } from "@/types/admin/lifecycle";
import type { LifecycleTransition } from "@/types/admin/lifecycle-history";
import type { TransitionResult } from "@/types/admin/lifecycle";

export interface AdminIntakeRepository {
  getAll(): DiscoveredEventIntake[];
  getById(id: string): DiscoveredEventIntake | undefined;
  getByStatus(status: IntakeStatus): DiscoveredEventIntake[];
  getBySource(source: IntakeSource): DiscoveredEventIntake[];
  getByFingerprint(fingerprint: string): DiscoveredEventIntake | undefined;
  create(input: CreateIntakeInput): DiscoveredEventIntake;
  update(intake: DiscoveredEventIntake): DiscoveredEventIntake;
  transition(
    id: string,
    targetStatus: IntakeStatus,
    context: TransitionContext
  ): { intake: DiscoveredEventIntake; result: TransitionResult };
  getHistory(entityId: string): LifecycleTransition[];
  countByStatus(status: IntakeStatus): number;
}

export type AdminTransitionOutcome =
  | { ok: true; intake: DiscoveredEventIntake; history: LifecycleTransition }
  | { ok: false; result: TransitionResult };
