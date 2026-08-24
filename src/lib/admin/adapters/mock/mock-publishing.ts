import {
  buildPublishChecklist,
  isPublishReady,
  canHumanApprove,
} from "@/lib/admin/publishing/publish-checklist";
import { buildAdminPublishPreview } from "@/lib/admin/publishing/intake-to-preview";
import type { PublishingPort, PublishValidationResult } from "@/lib/admin/ports/PublishingPort";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
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

  async publish(): Promise<DiscoveredEventIntake> {
    throw new Error(
      "Mock publishing is not a live publish path. Super Admin publish uses publish_event RPC."
    );
  }
}

export const mockPublishingAdapter = new MockPublishingAdapter();

export function validateHumanApproval(intake: DiscoveredEventIntake) {
  return canHumanApprove(intake);
}
