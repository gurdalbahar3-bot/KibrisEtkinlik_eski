import type {
  OrumcekStatus,
  OrumcekTransitionContext,
  OrumcekTransitionResult,
} from "@/lib/orumcek/types";

export const MOTOR_TRANSITIONS: Readonly<Record<OrumcekStatus, readonly OrumcekStatus[]>> = {
  DISCOVERED: ["AI_DRAFT"],
  AI_DRAFT: ["PENDING_APPROVAL", "REVIEW", "REJECTED"],
  REVIEW: ["PENDING_APPROVAL", "APPROVED_READY", "REJECTED", "AI_DRAFT"],
  PENDING_APPROVAL: ["APPROVED_READY", "REJECTED", "REVIEW"],
  APPROVED_READY: ["REJECTED"],
  REJECTED: [],
};

const SYSTEM_TRANSITIONS: Readonly<Partial<Record<OrumcekStatus, readonly OrumcekStatus[]>>> = {
  DISCOVERED: ["AI_DRAFT"],
  AI_DRAFT: ["PENDING_APPROVAL", "REVIEW"],
};

const SUPER_ADMIN_ONLY_TARGETS: readonly OrumcekStatus[] = ["APPROVED_READY", "REJECTED"];

export function canTransitionMotor(from: OrumcekStatus, to: OrumcekStatus): boolean {
  return MOTOR_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isPublishForbidden(target: string): boolean {
  return target === "PUBLISHED" || target === "APPROVED";
}

export function transitionMotor(
  from: OrumcekStatus,
  to: OrumcekStatus,
  context: OrumcekTransitionContext
): OrumcekTransitionResult {
  if (isPublishForbidden(to)) {
    return {
      ok: false,
      code: "PUBLISH_FORBIDDEN",
      message: "Örümcek must never transition to APPROVED or PUBLISHED. Super Admin publish_event is the only public gate.",
    };
  }

  if (from === to) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Already in status ${to}.`,
    };
  }

  if (!canTransitionMotor(from, to)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Invalid Örümcek transition: ${from} → ${to}.`,
    };
  }

  if (SUPER_ADMIN_ONLY_TARGETS.includes(to) && context.actor !== "SUPER_ADMIN") {
    return {
      ok: false,
      code: "ACTOR_NOT_ALLOWED",
      message: `Transition ${from} → ${to} requires SUPER_ADMIN.`,
    };
  }

  if (to === "REJECTED" && !context.reason?.trim()) {
    return {
      ok: false,
      code: "REASON_REQUIRED",
      message: "Rejection reason is required.",
    };
  }

  if (context.actor === "SYSTEM") {
    const allowed = SYSTEM_TRANSITIONS[from];
    if (!allowed?.includes(to)) {
      return {
        ok: false,
        code: "ACTOR_NOT_ALLOWED",
        message: `SYSTEM cannot transition ${from} → ${to}.`,
      };
    }
  }

  return { ok: true, from, to };
}

export function destinationFromConfidence(unsure: boolean): Extract<OrumcekStatus, "PENDING_APPROVAL" | "REVIEW"> {
  return unsure ? "REVIEW" : "PENDING_APPROVAL";
}
