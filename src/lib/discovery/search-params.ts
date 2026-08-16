import { CATEGORY_KEYS } from "@/lib/data/categories";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DistrictSlug, EventCategory } from "@/types/event";

export type DateFilterKey =
  | "today"
  | "tomorrow"
  | "weekend"
  | "week"
  | "month";

export interface DiscoverySearchParams {
  q?: string;
  date?: DateFilterKey;
  district?: DistrictSlug;
  category?: EventCategory;
}

export function parseDiscoverySearchParams(
  raw: Record<string, string | string[] | undefined>
): DiscoverySearchParams {
  const q = typeof raw.q === "string" ? raw.q.trim() : undefined;
  const dateRaw = typeof raw.date === "string" ? raw.date : undefined;
  const districtRaw = typeof raw.district === "string" ? raw.district : undefined;
  const categoryRaw = typeof raw.category === "string" ? raw.category : undefined;

  const date = isDateFilter(dateRaw) ? dateRaw : undefined;
  const district = DISTRICT_SLUGS.includes(districtRaw as DistrictSlug)
    ? (districtRaw as DistrictSlug)
    : undefined;
  const category = CATEGORY_KEYS.includes(categoryRaw as EventCategory)
    ? (categoryRaw as EventCategory)
    : undefined;

  return {
    q: q || undefined,
    date,
    district,
    category,
  };
}

function isDateFilter(value: string | undefined): value is DateFilterKey {
  return (
    value === "today" ||
    value === "tomorrow" ||
    value === "weekend" ||
    value === "week" ||
    value === "month"
  );
}

export function buildDiscoveryQueryString(params: DiscoverySearchParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.date) sp.set("date", params.date);
  if (params.district) sp.set("district", params.district);
  if (params.category) sp.set("category", params.category);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function quickFilterToDate(key: string): DateFilterKey | undefined {
  const map: Record<string, DateFilterKey> = {
    today: "today",
    tomorrow: "tomorrow",
    weekend: "weekend",
    thisWeek: "week",
    thisMonth: "month",
  };
  return map[key];
}
