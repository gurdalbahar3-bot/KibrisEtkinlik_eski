import type { IntakeStatus } from "@/types/admin/lifecycle";

/** Allowed structural transitions — actor rules applied separately in state-machine. */
export const ALLOWED_TRANSITIONS: Readonly<Record<IntakeStatus, readonly IntakeStatus[]>> = {
  DISCOVERED: ["AI_REVIEW"],
  AI_REVIEW: ["IMAGE_REVIEW", "REJECTED"],
  IMAGE_REVIEW: ["PENDING_APPROVAL", "REJECTED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED"],
  REJECTED: ["DISCOVERED"],
  PUBLISHED: ["SOCIAL_DISTRIBUTION", "EDIT_REVIEW", "ARCHIVED"],
  SOCIAL_DISTRIBUTION: ["COMPLETED"],
  EDIT_REVIEW: ["PENDING_APPROVAL"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: ["DISCOVERED"],
};

/** Statuses that may never transition directly to APPROVED or PUBLISHED. */
export const NO_DIRECT_APPROVE_OR_PUBLISH_FROM: readonly IntakeStatus[] = [
  "DISCOVERED",
  "AI_REVIEW",
  "IMAGE_REVIEW",
];

/** Transitions that require a human super admin actor. */
export const SUPER_ADMIN_ONLY_TRANSITIONS: Readonly<
  Partial<Record<IntakeStatus, readonly IntakeStatus[]>>
> = {
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED"],
};
