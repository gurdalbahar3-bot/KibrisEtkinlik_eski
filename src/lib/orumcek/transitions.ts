import { transitionMotor } from "@/lib/orumcek/state-machine";
import { getDraftById, replaceDraft } from "@/lib/orumcek/store";
import type {
  IntakeDraft,
  OrumcekStatus,
  OrumcekTransitionContext,
  OrumcekTransitionResult,
} from "@/lib/orumcek/types";

export type ApplyDraftTransitionResult =
  | { ok: true; draft: IntakeDraft; result: Extract<OrumcekTransitionResult, { ok: true }> }
  | { ok: false; draft?: IntakeDraft; result: Extract<OrumcekTransitionResult, { ok: false }> };

export function applyDraftTransition(
  id: string,
  target: OrumcekStatus,
  context: OrumcekTransitionContext
): ApplyDraftTransitionResult {
  const current = getDraftById(id);
  if (!current) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "INVALID_TRANSITION",
        message: `Örümcek draft not found: ${id}`,
      },
    };
  }

  const result = transitionMotor(current.status, target, context);
  if (!result.ok) {
    return { ok: false, draft: current, result };
  }

  const now = new Date().toISOString();
  const next: IntakeDraft = {
    ...current,
    status: target,
    wrotePublicEvent: false,
    updatedAt: now,
  };

  if (target === "APPROVED_READY") {
    next.approvedBy = context.actorId;
    next.approvedAt = now;
    next.rejectionReason = undefined;
    next.rejectedBy = undefined;
    next.rejectedAt = undefined;
  }

  if (target === "REJECTED") {
    next.rejectionReason = context.reason?.trim();
    next.rejectedBy = context.actorId;
    next.rejectedAt = now;
  }

  return { ok: true, draft: replaceDraft(next), result };
}
