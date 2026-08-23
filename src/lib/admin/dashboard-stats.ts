import type { AdminDashboardStat } from "@/lib/admin/mock/dashboard-stats";
import { countBlockedPendingCandidates } from "@/lib/admin/review/image-review-service";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

/** Derive queue counts from mock intake repository; ads remain static until FAZ 4+. */
export function getDashboardStatsFromRepository(): AdminDashboardStat[] {
  const repo = mockAdminIntakeRepository;
  const imageReviewIntakes = repo.getByStatus("IMAGE_REVIEW");
  const blockedCount = countBlockedPendingCandidates(imageReviewIntakes);

  return [
    {
      id: "intake",
      labelKey: "statNewIntake",
      count: repo.countByStatus("DISCOVERED"),
      href: "/admin/intake?status=DISCOVERED",
    },
    {
      id: "ai",
      labelKey: "statAiReview",
      count: repo.countByStatus("AI_REVIEW"),
      href: "/admin/review/ai",
    },
    {
      id: "images",
      labelKey: "statImageReview",
      count: repo.countByStatus("IMAGE_REVIEW"),
      href: "/admin/review/images",
    },
    {
      id: "blocked",
      labelKey: "statBlockedImages",
      count: blockedCount,
      href: "/admin/review/images",
    },
    {
      id: "approval",
      labelKey: "statPendingApproval",
      count: repo.countByStatus("PENDING_APPROVAL"),
      href: "/admin/review/approval",
    },
    {
      id: "publishing",
      labelKey: "statPublishing",
      count: repo.countByStatus("APPROVED"),
      href: "/admin/publishing",
    },
    {
      id: "published",
      labelKey: "statPublished",
      count: repo.countByStatus("PUBLISHED"),
      href: "/admin/publishing",
    },
    {
      id: "social",
      labelKey: "statSocialQueue",
      count: repo.countByStatus("SOCIAL_DISTRIBUTION"),
      href: "/admin/distribution/social",
    },
    {
      id: "ads",
      labelKey: "statActiveAds",
      count: 1,
      href: "/admin/distribution/ads",
    },
  ];
}
