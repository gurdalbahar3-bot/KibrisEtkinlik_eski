"use server";

import { revalidatePath } from "next/cache";
import { getAdminAuth } from "@/lib/admin/auth";
import { reloadFixtureDrafts } from "@/lib/orumcek/fixtures";
import { applyDraftTransition } from "@/lib/orumcek/transitions";

export type OrumcekActionResult =
  | { ok: true; publishCalled: false }
  | { ok: false; message: string; publishCalled: false };

function revalidateOrumcekPaths(id?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/review/ai");
  if (id) {
    revalidatePath(`/admin/review/ai/${id}`);
  }
}

async function requireSuperAdminId(): Promise<string> {
  const session = await getAdminAuth().requireSuperAdmin();
  return session.userId;
}

export async function approveOrumcekDraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "");
  const result = await approveOrumcekDraft(id);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function rejectOrumcekDraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await rejectOrumcekDraft(id, reason);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function sendOrumcekDraftToReviewAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "");
  const actorId = await requireSuperAdminId();
  const applied = applyDraftTransition(id, "REVIEW", {
    actor: "SUPER_ADMIN",
    actorId,
  });
  if (!applied.ok) {
    throw new Error(applied.result.message);
  }
  revalidateOrumcekPaths(id);
}

export async function reloadOrumcekFixturesAction(): Promise<void> {
  await requireSuperAdminId();
  reloadFixtureDrafts();
  revalidateOrumcekPaths();
}

export async function approveOrumcekDraft(id: string): Promise<OrumcekActionResult> {
  const actorId = await requireSuperAdminId();
  const applied = applyDraftTransition(id, "APPROVED_READY", {
    actor: "SUPER_ADMIN",
    actorId,
  });
  if (!applied.ok) {
    return { ok: false, message: applied.result.message, publishCalled: false };
  }
  revalidateOrumcekPaths(id);
  return { ok: true, publishCalled: false };
}

export async function rejectOrumcekDraft(id: string, reason: string): Promise<OrumcekActionResult> {
  const actorId = await requireSuperAdminId();
  const applied = applyDraftTransition(id, "REJECTED", {
    actor: "SUPER_ADMIN",
    actorId,
    reason,
  });
  if (!applied.ok) {
    return { ok: false, message: applied.result.message, publishCalled: false };
  }
  revalidateOrumcekPaths(id);
  return { ok: true, publishCalled: false };
}
