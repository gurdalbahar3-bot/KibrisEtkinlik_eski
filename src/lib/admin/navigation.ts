import type { AdminMessages } from "@/lib/admin/i18n";

export type AdminNavKey =
  | "dashboard"
  | "intake"
  | "aiReview"
  | "imageReview"
  | "approval"
  | "eventReview"
  | "publishing"
  | "events"
  | "social"
  | "ads"
  | "audit"
  | "settings";

export interface AdminNavItem {
  href: string;
  labelKey: AdminNavKey;
  exact?: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", labelKey: "dashboard", exact: true },
  { href: "/admin/intake", labelKey: "intake" },
  { href: "/admin/review/ai", labelKey: "aiReview" },
  { href: "/admin/review/images", labelKey: "imageReview" },
  { href: "/admin/review/approval", labelKey: "approval" },
  { href: "/admin/review/events", labelKey: "eventReview" },
  { href: "/admin/publishing", labelKey: "publishing" },
  { href: "/admin/events", labelKey: "events" },
  { href: "/admin/distribution/social", labelKey: "social" },
  { href: "/admin/distribution/ads", labelKey: "ads" },
  { href: "/admin/audit", labelKey: "audit" },
  { href: "/admin/settings", labelKey: "settings" },
];

export function getAdminNavLabel(
  t: (key: keyof AdminMessages) => string,
  key: AdminNavKey
): string {
  return t(key);
}
