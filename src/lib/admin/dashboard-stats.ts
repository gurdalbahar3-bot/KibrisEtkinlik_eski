import { getAdminPublicEvents } from "@/lib/admin/data/admin-events-read";
import {
  buildAdminDashboardViewModel,
  type AdminDashboardViewModel,
} from "@/lib/admin/dashboard-view-model";
import type { AdminDashboardStat } from "@/lib/admin/mock/dashboard-stats";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import { countBlockedPendingCandidates } from "@/lib/admin/review/image-review-service";
import { ensureFixtureDrafts } from "@/lib/orumcek/fixtures";
import { countQueueDrafts } from "@/lib/orumcek/store";
import { getDataSource } from "@/lib/supabase/config";

/** Derive queue counts from mock intake repository; ads remain static until FAZ 4+. */
export function getDashboardStatsFromRepository(): AdminDashboardStat[] {
  const repo = mockAdminIntakeRepository;
  const imageReviewIntakes = repo.getByStatus("IMAGE_REVIEW");
  const blockedCount = countBlockedPendingCandidates(imageReviewIntakes);
  ensureFixtureDrafts();

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
      count: repo.countByStatus("AI_REVIEW") + countQueueDrafts(),
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

export async function getAdminDashboardViewModel(): Promise<AdminDashboardViewModel> {
  const dataSource = getDataSource();
  return buildAdminDashboardViewModel({
    dataSource,
    mockIntakeStats: getDashboardStatsFromRepository(),
    adminEvents: dataSource === "supabase" ? await getAdminPublicEvents() : [],
  });
}
