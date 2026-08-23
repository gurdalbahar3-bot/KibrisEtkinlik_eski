import {
  buildPublishChecklist,
  isPublishReady,
  canHumanApprove,
} from "@/lib/admin/publishing/publish-checklist";
import { buildAdminPublishPreview } from "@/lib/admin/publishing/intake-to-preview";
import type { PublishingPort, PublishValidationResult } from "@/lib/admin/ports/PublishingPort";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { TransitionActor } from "@/types/admin/lifecycle";
import type { Locale } from "@/lib/i18n/routing";

export class MockPublishingAdapter implements PublishingPort {
  validatePublish(intake: DiscoveredEventIntake): PublishValidationResult {
    const checklist = buildPublishChecklist(intake);
    const errors: string[] = [];

    if (intake.status !== "APPROVED") {
      errors.push("Event must be in APPROVED status before publishing.");
    }

    for (const item of checklist) {
      if (!item.passed) {
        errors.push(`Checklist failed: ${item.labelKey}`);
      }
    }

    return {
      ok: intake.status === "APPROVED" && isPublishReady(intake),
      checklist,
      errors,
    };
  }

  getPublishPreview(intake: DiscoveredEventIntake, locale: Locale) {
    return buildAdminPublishPreview(intake, locale);
  }

  async publish(intakeId: string, actor: TransitionActor): Promise<DiscoveredEventIntake> {
    const intake = mockAdminIntakeRepository.getById(intakeId);
    if (!intake) {
      throw new Error("Intake not found.");
    }

    const validation = this.validatePublish(intake);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    if (actor.type !== "SUPER_ADMIN") {
      throw new Error("Publishing requires SUPER_ADMIN actor.");
    }

    const { result } = mockAdminIntakeRepository.transition(intakeId, "PUBLISHED", {
      actor,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const timestamp = new Date().toISOString();
    const updated = mockAdminIntakeRepository.update({
      ...mockAdminIntakeRepository.getById(intakeId)!,
      publishedBy: actor.id,
      publishedAt: timestamp,
      platformEventId: intake.platformEventId ?? `mock-platform-${intakeId}`,
    });

    return updated;
  }
}

export const mockPublishingAdapter = new MockPublishingAdapter();

export function validateHumanApproval(intake: DiscoveredEventIntake) {
  return canHumanApprove(intake);
}
