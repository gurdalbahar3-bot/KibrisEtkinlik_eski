import { isImageCandidateApprovable } from "@/types/admin/image-policy";
import type { ImageCandidate } from "@/types/admin/image-candidate";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

export function getEventContext(intake: DiscoveredEventIntake) {
  return {
    eventDistrictId: intake.suggestedDistrictId,
    eventVenueId: intake.suggestedVenueId,
  };
}

export function countBlockedPendingCandidates(intakes: DiscoveredEventIntake[]): number {
  return intakes.reduce((total, intake) => {
    const ctx = getEventContext(intake);
    const blocked = intake.imageCandidates.filter(
      (candidate) =>
        candidate.status === "PENDING" &&
        !isImageCandidateApprovable(candidate, ctx)
    );
    return total + blocked.length;
  }, 0);
}

export function hasApprovedValidImage(intake: DiscoveredEventIntake): boolean {
  const ctx = getEventContext(intake);
  return intake.imageCandidates.some(
    (candidate) =>
      candidate.status === "APPROVED" && isImageCandidateApprovable(candidate, ctx)
  );
}

export function canTransitionIntakeToPendingApproval(intake: DiscoveredEventIntake): boolean {
  return intake.status === "IMAGE_REVIEW" && hasApprovedValidImage(intake);
}

export function sortCandidatesByPriority(candidates: ImageCandidate[]): ImageCandidate[] {
  const priority: Record<ImageCandidate["source"], number> = {
    OFFICIAL: 0,
    VENUE: 1,
    LOCAL: 2,
    AI: 3,
  };
  return [...candidates].sort((a, b) => priority[a.source] - priority[b.source]);
}
