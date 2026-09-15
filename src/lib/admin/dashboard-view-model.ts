import type { AdminDashboardStat } from "./mock/dashboard-stats";
import { isDefaultPublishableStatus } from "./publish-event-result.ts";
import type { DataSource } from "../supabase/config";

export const INTAKE_LAB_DASHBOARD_STAT_IDS = [
  "intake",
  "ai",
  "images",
  "blocked",
  "approval",
  "social",
  "ads",
] as const;

export const LIVE_ADMIN_EVENT_DASHBOARD_STAT_IDS = ["publishing", "published"] as const;

export type PublishingBadgeKey = "mockPublishingBadge" | "realPublishingBadge";

export function getPublishingBadgeKey(dataSource: DataSource): PublishingBadgeKey {
  return dataSource === "supabase" ? "realPublishingBadge" : "mockPublishingBadge";
}

export type AdminEventHeaderBadgeKey =
  | PublishingBadgeKey
  | "adminEventCatalogBadge";

export function getAdminEventHeaderBadgeKey(
  dataSource: DataSource,
  canPublish: boolean
): AdminEventHeaderBadgeKey {
  if (dataSource === "mock") {
    return "mockPublishingBadge";
  }
  return canPublish ? "realPublishingBadge" : "adminEventCatalogBadge";
}

export interface DashboardEventCountInput {
  id: string;
  status: string;
}

export interface AdminDashboardViewModel {
  dataSource: DataSource;
  badgeKey: PublishingBadgeKey;
  showMockDataLabel: boolean;
  stats: AdminDashboardStat[];
}

export function countPublishableAdminEvents(events: DashboardEventCountInput[]): number {
  return events.filter((event) => isDefaultPublishableStatus(event.status)).length;
}

export function countPublishedAdminEvents(events: DashboardEventCountInput[]): number {
  return events.filter((event) => event.status === "published").length;
}

/**
 * Mock source keeps intake-lab KPIs.
 * Supabase source uses real admin event READ counts only — no fake intake/AI/ads zeros.
 */
export function buildAdminDashboardViewModel(options: {
  dataSource: DataSource;
  mockIntakeStats: AdminDashboardStat[];
  adminEvents: DashboardEventCountInput[];
}): AdminDashboardViewModel {
  if (options.dataSource === "mock") {
    return {
      dataSource: "mock",
      badgeKey: "mockPublishingBadge",
      showMockDataLabel: true,
      stats: options.mockIntakeStats,
    };
  }

  return {
    dataSource: "supabase",
    badgeKey: "realPublishingBadge",
    showMockDataLabel: false,
    stats: [
      {
        id: "publishing",
        labelKey: "statPublishing",
        count: countPublishableAdminEvents(options.adminEvents),
        href: "/admin/publishing",
      },
      {
        id: "published",
        labelKey: "statPublished",
        count: countPublishedAdminEvents(options.adminEvents),
        href: "/admin/events",
      },
    ],
  };
}
