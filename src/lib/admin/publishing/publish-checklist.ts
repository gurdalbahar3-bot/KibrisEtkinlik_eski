import { normalizeEventTitle } from "@/lib/admin/intake/normalize";
import { getEventContext, hasApprovedValidImage } from "@/lib/admin/review/image-review-service";
import { evaluateImageCandidate } from "@/types/admin/image-policy";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

export interface PublishChecklistItem {
  id: string;
  labelKey:
    | "checkTitle"
    | "checkDate"
    | "checkDistrict"
    | "checkVenue"
    | "checkCategory"
    | "checkDescription"
    | "checkValidImage"
    | "checkSeoSlug"
    | "checkDistrictMatch"
    | "checkAiHumanApproved"
    | "checkPublishableStatus";
  passed: boolean;
}

export function intakeToSlug(title: string): string {
  return normalizeEventTitle(title)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function getApprovedImageCandidate(intake: DiscoveredEventIntake) {
  const ctx = getEventContext(intake);
  return intake.imageCandidates.find(
    (candidate) =>
      candidate.status === "APPROVED" &&
      evaluateImageCandidate(candidate, ctx).verdict === "VALID"
  );
}

export function buildPublishChecklist(intake: DiscoveredEventIntake): PublishChecklistItem[] {
  const ctx = getEventContext(intake);
  const approvedImage = getApprovedImageCandidate(intake);
  const imagePolicy = approvedImage
    ? evaluateImageCandidate(approvedImage, ctx)
    : null;
  const slug = intakeToSlug(intake.rawTitle);

  return [
    { id: "title", labelKey: "checkTitle", passed: Boolean(intake.rawTitle?.trim()) },
    { id: "date", labelKey: "checkDate", passed: Boolean(intake.suggestedStartsAt?.trim()) },
    {
      id: "district",
      labelKey: "checkDistrict",
      passed: Boolean(intake.suggestedDistrictId),
    },
    {
      id: "venue",
      labelKey: "checkVenue",
      passed: Boolean(intake.suggestedVenueId?.trim()),
    },
    {
      id: "category",
      labelKey: "checkCategory",
      passed: Boolean(intake.suggestedCategory),
    },
    {
      id: "description",
      labelKey: "checkDescription",
      passed: Boolean(intake.rawDescription?.trim()),
    },
    {
      id: "validImage",
      labelKey: "checkValidImage",
      passed: hasApprovedValidImage(intake),
    },
    { id: "seoSlug", labelKey: "checkSeoSlug", passed: Boolean(slug) },
    {
      id: "districtMatch",
      labelKey: "checkDistrictMatch",
      passed: imagePolicy?.verdict === "VALID",
    },
    {
      id: "aiHumanApproved",
      labelKey: "checkAiHumanApproved",
      passed:
        !approvedImage ||
        !(approvedImage.source === "AI" || approvedImage.generatedByAi) ||
        Boolean(approvedImage.reviewedBy),
    },
  ];
}

export function isPublishReady(intake: DiscoveredEventIntake): boolean {
  return buildPublishChecklist(intake).every((item) => item.passed);
}

export function canHumanApprove(intake: DiscoveredEventIntake): {
  ok: boolean;
  message?: string;
} {
  if (!hasApprovedValidImage(intake)) {
    return {
      ok: false,
      message: "Cannot approve without a valid human-reviewed image candidate.",
    };
  }

  const ctx = getEventContext(intake);
  const hasBlockedApproved = intake.imageCandidates.some(
    (candidate) =>
      candidate.status === "APPROVED" &&
      evaluateImageCandidate(candidate, ctx).verdict === "BLOCKED"
  );

  if (hasBlockedApproved) {
    return {
      ok: false,
      message: "Cannot approve with a BLOCKED image candidate.",
    };
  }

  return { ok: true };
}
