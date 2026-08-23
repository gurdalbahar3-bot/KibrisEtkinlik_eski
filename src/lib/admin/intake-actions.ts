"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/admin/auth";
import { createManualIntake } from "@/lib/admin/intake/create-manual-intake";
import {
  mockAdminIntakeRepository,
  updateMockImageCandidate,
} from "@/lib/admin/repositories/mock-admin-intake-repository";
import type { ManualIntakeFormData } from "@/types/admin/intake";
import type { DistrictSlug, EventCategory } from "@/types/event";
import { DISTRICT_SLUGS, CATEGORY_KEYS } from "@/lib/data/categories";
import { mockPublishingAdapter } from "@/lib/admin/adapters/mock/mock-publishing";
import { canHumanApprove } from "@/lib/admin/publishing/publish-checklist";
import { callPublishEvent } from "@/lib/admin/data/admin-event-lifecycle-rpc";
import {
  messageForLifecycleError,
  resolveIntakePublishEventId,
} from "@/lib/admin/data/admin-event-lifecycle";
import {
  canTransitionIntakeToPendingApproval,
  getEventContext,
} from "@/lib/admin/review/image-review-service";
import {
  evaluateImageCandidate,
} from "@/types/admin/image-policy";
import type { IntakeStatus } from "@/types/admin/lifecycle";
import type { ImageCandidateStatus } from "@/types/admin/image-candidate";

export type IntakeActionResult =
  | { ok: true }
  | { ok: false; message: string };

async function getSuperAdminActor() {
  const auth = getAdminAuth();
  const session = await auth.requireSuperAdmin();
  return { type: "SUPER_ADMIN" as const, id: session.userId };
}

async function getSystemActor() {
  return { type: "SYSTEM" as const, id: "system" };
}

export async function transitionIntakeAction(
  id: string,
  targetStatus: IntakeStatus,
  options?: { reason?: string; actorType?: "SYSTEM" | "SUPER_ADMIN" }
): Promise<IntakeActionResult> {
  const actor =
    options?.actorType === "SYSTEM"
      ? await getSystemActor()
      : await getSuperAdminActor();

  const { result } = mockAdminIntakeRepository.transition(id, targetStatus, {
    actor,
    reason: options?.reason,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/intake");
  revalidatePath(`/admin/intake/${id}`);
  revalidatePath("/admin/review/ai");
  revalidatePath("/admin/review/images");
  revalidatePath("/admin/review/approval");
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${id}`);

  return { ok: true };
}

export async function sendToAiReviewAction(id: string): Promise<IntakeActionResult> {
  return transitionIntakeAction(id, "AI_REVIEW", { actorType: "SYSTEM" });
}

export async function sendToAiReviewFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await sendToAiReviewAction(id);
}

export async function approveImageFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  const result = await updateImageCandidateStatusAction(intakeId, candidateId, "APPROVED");
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function rejectImageFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await updateImageCandidateStatusAction(intakeId, candidateId, "REJECTED", reason);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function sendToImageReviewFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const result = await sendToImageReviewAction(intakeId);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function rejectFromAiReviewFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await rejectIntakeAction(intakeId, reason);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function sendToImageReviewAction(id: string): Promise<IntakeActionResult> {
  const intake = mockAdminIntakeRepository.getById(id);
  if (!intake) {
    return { ok: false, message: "Intake not found." };
  }
  if (intake.status !== "AI_REVIEW") {
    return { ok: false, message: "Intake is not in AI_REVIEW status." };
  }
  return transitionIntakeAction(id, "IMAGE_REVIEW");
}

export async function approveIntakeFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const result = await approveIntakeAction(intakeId);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function rejectIntakeFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await rejectIntakeAction(intakeId, reason);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function approveIntakeAction(id: string): Promise<IntakeActionResult> {
  const session = await getSuperAdminActor();
  const intake = mockAdminIntakeRepository.getById(id);
  if (!intake) {
    return { ok: false, message: "Intake not found." };
  }

  const approvalCheck = canHumanApprove(intake);
  if (!approvalCheck.ok) {
    return { ok: false, message: approvalCheck.message ?? "Cannot approve intake." };
  }

  const result = await transitionIntakeAction(id, "APPROVED");
  if (!result.ok) {
    return result;
  }

  const current = mockAdminIntakeRepository.getById(id);
  if (current) {
    mockAdminIntakeRepository.update({
      ...current,
      approvedBy: session.id,
      approvedAt: new Date().toISOString(),
    });
  }

  revalidatePath("/admin/publishing");
  revalidatePath("/admin/review/approval");

  return { ok: true };
}

export async function publishIntakeAction(intakeId: string): Promise<IntakeActionResult> {
  await getSuperAdminActor();

  const intake = mockAdminIntakeRepository.getById(intakeId);
  if (!intake) {
    return { ok: false, message: messageForLifecycleError("INTAKE_NOT_FOUND") };
  }
  if (intake.status !== "APPROVED") {
    return { ok: false, message: messageForLifecycleError("INTAKE_NOT_APPROVED") };
  }

  const eventId = resolveIntakePublishEventId(intake.platformEventId);
  if (!eventId) {
    return { ok: false, message: messageForLifecycleError("INTAKE_NOT_LINKED_TO_EVENT") };
  }

  const result = await callPublishEvent(eventId);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  try {
    const session = await getSuperAdminActor();
    await mockPublishingAdapter.publish(intakeId, {
      type: "SUPER_ADMIN",
      id: session.id,
    });
  } catch {
    // Mock intake bookkeeping must not hide a successful events.status write.
  }

  revalidatePath("/admin");
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${intakeId}`);
  revalidatePath("/admin/review/approval");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/", "layout");

  return { ok: true };
}

export async function publishIntakeFormAction(formData: FormData): Promise<void> {
  const intakeId = String(formData.get("intakeId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/admin/publishing/${intakeId}`);
  const result = await publishIntakeAction(intakeId);
  if (!result.ok) {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}error=${encodeURIComponent("INTAKE_PUBLISH_FAILED")}&detail=${encodeURIComponent(result.message)}`);
  }

  const intake = mockAdminIntakeRepository.getById(intakeId);
  const eventId = resolveIntakePublishEventId(intake?.platformEventId);
  if (eventId) {
    redirect(`/admin/events/${eventId}?published=1`);
  }

  redirect("/admin/publishing?published=1");
}

export async function rejectIntakeAction(
  id: string,
  reason: string
): Promise<IntakeActionResult> {
  if (!reason.trim()) {
    return { ok: false, message: "Rejection reason is required." };
  }
  return transitionIntakeAction(id, "REJECTED", { reason });
}

export async function updateImageCandidateStatusAction(
  intakeId: string,
  candidateId: string,
  status: ImageCandidateStatus,
  rejectionReason?: string
): Promise<IntakeActionResult> {
  await getSuperAdminActor();

  const intake = mockAdminIntakeRepository.getById(intakeId);
  if (!intake) {
    return { ok: false, message: "Intake not found." };
  }

  const candidate = intake.imageCandidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return { ok: false, message: "Image candidate not found." };
  }

  if (status === "REJECTED" && !rejectionReason?.trim()) {
    return { ok: false, message: "Rejection reason is required." };
  }

  const eventContext = getEventContext(intake);
  const policy = evaluateImageCandidate(candidate, eventContext);

  if (status === "APPROVED") {
    if (policy.verdict === "BLOCKED") {
      return {
        ok: false,
        message: policy.reason ?? "Blocked image cannot be approved.",
      };
    }
  }

  const session = await getAdminAuth().requireSuperAdmin();

  const updatedIntake = updateMockImageCandidate(intakeId, {
    ...candidate,
    status,
    reviewedBy: session.userId,
    rejectionReason: status === "REJECTED" ? rejectionReason : undefined,
  });

  if (!updatedIntake) {
    return { ok: false, message: "Failed to update image candidate." };
  }

  if (status === "APPROVED" && canTransitionIntakeToPendingApproval(updatedIntake)) {
    const transition = mockAdminIntakeRepository.transition(intakeId, "PENDING_APPROVAL", {
      actor: { type: "SUPER_ADMIN", id: session.userId },
    });
    if (!transition.result.ok) {
      return { ok: false, message: transition.result.message };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/review/images");
  revalidatePath("/admin/review/approval");
  revalidatePath(`/admin/intake/${intakeId}`);

  return { ok: true };
}

export async function createManualIntakeAction(formData: FormData): Promise<void> {
  const auth = getAdminAuth();
  await auth.requireSuperAdmin();

  const rawTitle = String(formData.get("rawTitle") ?? "").trim();
  const suggestedDistrictId = String(formData.get("suggestedDistrictId") ?? "").trim();
  const suggestedStartsAt = String(formData.get("suggestedStartsAt") ?? "").trim();

  if (!rawTitle || !suggestedDistrictId || !suggestedStartsAt) {
    throw new Error("Required fields missing: rawTitle, suggestedDistrictId, suggestedStartsAt.");
  }

  if (!DISTRICT_SLUGS.includes(suggestedDistrictId as DistrictSlug)) {
    throw new Error("Invalid district.");
  }

  const categoryRaw = String(formData.get("suggestedCategory") ?? "").trim();
  const suggestedCategory = CATEGORY_KEYS.includes(categoryRaw as EventCategory)
    ? (categoryRaw as EventCategory)
    : undefined;

  const data: ManualIntakeFormData = {
    rawTitle,
    rawDescription: String(formData.get("rawDescription") ?? "").trim() || undefined,
    sourceUrl: String(formData.get("sourceUrl") ?? "").trim() || undefined,
    suggestedDistrictId: suggestedDistrictId as DistrictSlug,
    suggestedVenueId: String(formData.get("suggestedVenueId") ?? "").trim() || undefined,
    suggestedCategory,
    suggestedStartsAt: new Date(suggestedStartsAt).toISOString(),
    artist: String(formData.get("artist") ?? "").trim() || undefined,
    officialPosterUrl: String(formData.get("officialPosterUrl") ?? "").trim() || undefined,
    manualNote: String(formData.get("manualNote") ?? "").trim() || undefined,
  };

  const intake = createManualIntake(mockAdminIntakeRepository, data);

  revalidatePath("/admin");
  revalidatePath("/admin/intake");
  redirect(`/admin/intake/${intake.id}`);
}
