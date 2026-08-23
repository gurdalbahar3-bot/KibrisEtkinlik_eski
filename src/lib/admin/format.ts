import type { DistrictSlug } from "@/types/event";
import type { IntakeStatus } from "@/types/admin/lifecycle";

const DISTRICT_LABELS: Record<DistrictSlug, { tr: string; en: string }> = {
  lefkosa: { tr: "Lefkoşa", en: "Nicosia" },
  girne: { tr: "Girne", en: "Kyrenia" },
  gazimagusa: { tr: "Gazimağusa", en: "Famagusta" },
  guzelyurt: { tr: "Güzelyurt", en: "Morphou" },
  lefke: { tr: "Lefke", en: "Lefke" },
  iskele: { tr: "İskele", en: "Iskele" },
};

export function formatDistrictLabel(
  districtId: string,
  locale: "tr" | "en" = "tr"
): string {
  const labels = DISTRICT_LABELS[districtId as DistrictSlug];
  if (labels) {
    return labels[locale];
  }
  return districtId;
}

export function formatDateTime(iso: string | undefined, locale: "tr" | "en" = "tr"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(iso: string | undefined, locale: "tr" | "en" = "tr"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

export const STATUS_LABEL_KEYS: Record<
  IntakeStatus,
  keyof import("@/lib/admin/i18n").AdminMessages
> = {
  DISCOVERED: "statusDiscovered",
  AI_REVIEW: "statusAiReview",
  IMAGE_REVIEW: "statusImageReview",
  PENDING_APPROVAL: "statusPendingApproval",
  APPROVED: "statusApproved",
  REJECTED: "statusRejected",
  PUBLISHED: "statusPublished",
  SOCIAL_DISTRIBUTION: "statusSocialDistribution",
  EDIT_REVIEW: "statusEditReview",
  COMPLETED: "statusCompleted",
  ARCHIVED: "statusArchived",
};
