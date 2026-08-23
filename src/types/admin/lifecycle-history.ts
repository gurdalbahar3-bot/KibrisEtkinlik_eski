import type { ActorType, IntakeStatus } from "@/types/admin/lifecycle";

export interface LifecycleTransition {
  id: string;
  entityId: string;
  fromStatus: IntakeStatus;
  toStatus: IntakeStatus;
  actorType: ActorType;
  actorId?: string;
  reason?: string;
  createdAt: string;
}
