export interface AdminDashboardStat {
  id: string;
  labelKey:
    | "statNewIntake"
    | "statAiReview"
    | "statImageReview"
    | "statBlockedImages"
    | "statPendingApproval"
    | "statPublishing"
    | "statPublished"
    | "statSocialQueue"
    | "statActiveAds";
  count: number;
  href: string;
}

/** Mock queue counters — not connected to public discovery or DB. */
export const MOCK_DASHBOARD_STATS: AdminDashboardStat[] = [
  { id: "intake", labelKey: "statNewIntake", count: 12, href: "/admin/intake" },
  { id: "ai", labelKey: "statAiReview", count: 5, href: "/admin/review/ai" },
  { id: "images", labelKey: "statImageReview", count: 8, href: "/admin/review/images" },
  { id: "approval", labelKey: "statPendingApproval", count: 3, href: "/admin/review/approval" },
  { id: "publishing", labelKey: "statPublishing", count: 2, href: "/admin/publishing" },
  { id: "social", labelKey: "statSocialQueue", count: 4, href: "/admin/distribution/social" },
  { id: "ads", labelKey: "statActiveAds", count: 1, href: "/admin/distribution/ads" },
];
