import type { TransitionActor } from "@/types/admin/lifecycle";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { Locale } from "@/lib/i18n/routing";
import type { AdminPublishPreview } from "@/lib/admin/publishing/intake-to-preview";
import type { PublishChecklistItem } from "@/lib/admin/publishing/publish-checklist";

export interface PublishValidationResult {
  ok: boolean;
  checklist: PublishChecklistItem[];
  errors: string[];
}

export interface PublishingPort {
  validatePublish(intake: DiscoveredEventIntake): PublishValidationResult;
  getPublishPreview(intake: DiscoveredEventIntake, locale: Locale): AdminPublishPreview;
  publish(intakeId: string, actor: TransitionActor): Promise<DiscoveredEventIntake>;
}
