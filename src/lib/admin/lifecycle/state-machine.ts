import type {
  IntakeStatus,
  TransitionContext,
  TransitionResult,
} from "@/types/admin/lifecycle";
import {
  ALLOWED_TRANSITIONS,
  NO_DIRECT_APPROVE_OR_PUBLISH_FROM,
  SUPER_ADMIN_ONLY_TRANSITIONS,
} from "@/lib/admin/lifecycle/transitions";

export function canTransition(from: IntakeStatus, to: IntakeStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function requiresSuperAdmin(from: IntakeStatus, to: IntakeStatus): boolean {
  return SUPER_ADMIN_ONLY_TRANSITIONS[from]?.includes(to) ?? false;
}

function isBlockedDirectApproval(from: IntakeStatus, to: IntakeStatus): boolean {
  if (!NO_DIRECT_APPROVE_OR_PUBLISH_FROM.includes(from)) {
    return false;
  }
  return to === "APPROVED" || to === "PUBLISHED";
}

export function transitionStatus(
  currentStatus: IntakeStatus,
  targetStatus: IntakeStatus,
  context?: TransitionContext
): TransitionResult {
  if (currentStatus === targetStatus) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Already in status ${targetStatus}.`,
    };
  }

  if (isBlockedDirectApproval(currentStatus, targetStatus)) {
    return {
      ok: false,
      code: "HUMAN_APPROVAL_REQUIRED",
      message: `Cannot transition from ${currentStatus} directly to ${targetStatus}. Human approval pipeline required.`,
    };
  }

  if (!canTransition(currentStatus, targetStatus)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Invalid transition: ${currentStatus} → ${targetStatus}.`,
    };
  }

  if (targetStatus === "REJECTED") {
    if (!context?.actor || context.actor.type !== "SUPER_ADMIN") {
      return {
        ok: false,
        code: "ACTOR_NOT_ALLOWED",
        message: `Transition ${currentStatus} → REJECTED requires SUPER_ADMIN actor.`,
      };
    }

    if (!context.reason?.trim()) {
      return {
        ok: false,
        code: "REASON_REQUIRED",
        message: "Rejection reason is required.",
      };
    }
  }

  if (requiresSuperAdmin(currentStatus, targetStatus)) {
    if (!context?.actor || context.actor.type !== "SUPER_ADMIN") {
      return {
        ok: false,
        code: "ACTOR_NOT_ALLOWED",
        message: `Transition ${currentStatus} → ${targetStatus} requires SUPER_ADMIN actor.`,
      };
    }

    if (targetStatus === "REJECTED" && !context.reason?.trim()) {
      return {
        ok: false,
        code: "REASON_REQUIRED",
        message: "Rejection reason is required.",
      };
    }
  }

  return {
    ok: true,
    from: currentStatus,
    to: targetStatus,
  };
}
