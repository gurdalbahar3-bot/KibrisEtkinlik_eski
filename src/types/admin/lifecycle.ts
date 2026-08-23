export const INTAKE_STATUSES = [
  "DISCOVERED",
  "AI_REVIEW",
  "IMAGE_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "SOCIAL_DISTRIBUTION",
  "EDIT_REVIEW",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export type ActorType = "SYSTEM" | "SUPER_ADMIN";

export interface TransitionActor {
  type: ActorType;
  id?: string;
}

export interface TransitionContext {
  actor: TransitionActor;
  reason?: string;
}

export type TransitionErrorCode =
  | "INVALID_TRANSITION"
  | "ACTOR_NOT_ALLOWED"
  | "REASON_REQUIRED"
  | "HUMAN_APPROVAL_REQUIRED";

export interface TransitionSuccess {
  ok: true;
  from: IntakeStatus;
  to: IntakeStatus;
}

export interface TransitionFailure {
  ok: false;
  code: TransitionErrorCode;
  message: string;
}

export type TransitionResult = TransitionSuccess | TransitionFailure;
