import { CATEGORY_KEYS } from "@/lib/data/categories";
import { DISTRICT_SLUGS } from "@/lib/data/categories";
import type { SortKey } from "@/lib/discovery/sort-events";
import type { DistrictSlug, EventCategory } from "@/types/event";

export type DateFilterKey =
  | "today"
  | "tomorrow"
  | "weekend"
  | "week"
  | "month";

export type DiscoverySearchScope = "event" | "artist" | "venue";

export interface DiscoverySearchParams {
  q?: string;
  date?: DateFilterKey;
  /** Absolute date range (YYYY-MM-DD). Used when `date` preset is absent. */
  from?: string;
  to?: string;
  district?: DistrictSlug;
  category?: EventCategory;
  sort?: SortKey;
  /** Hero/listing search scope — event/artist → events; venue → venues listing. */
  scope?: DiscoverySearchScope;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && ISO_DATE.test(value));
}

export function parseDiscoverySearchParams(
  raw: Record<string, string | string[] | undefined>
): DiscoverySearchParams {
  const q = typeof raw.q === "string" ? raw.q.trim() : undefined;
  const dateRaw = typeof raw.date === "string" ? raw.date : undefined;
  const fromRaw = typeof raw.from === "string" ? raw.from.trim() : undefined;
  const toRaw = typeof raw.to === "string" ? raw.to.trim() : undefined;
  const districtRaw = typeof raw.district === "string" ? raw.district : undefined;
  const categoryRaw = typeof raw.category === "string" ? raw.category : undefined;
  const sortRaw = typeof raw.sort === "string" ? raw.sort : undefined;
  const scopeRaw = typeof raw.scope === "string" ? raw.scope : undefined;

  const date = isDateFilter(dateRaw) ? dateRaw : undefined;
  const from = isIsoDate(fromRaw) ? fromRaw : undefined;
  const to = isIsoDate(toRaw) ? toRaw : undefined;
  const district = DISTRICT_SLUGS.includes(districtRaw as DistrictSlug)
    ? (districtRaw as DistrictSlug)
    : undefined;
  const category = CATEGORY_KEYS.includes(categoryRaw as EventCategory)
    ? (categoryRaw as EventCategory)
    : undefined;
  const sort = isSortKey(sortRaw) ? sortRaw : undefined;
  const scope = isSearchScope(scopeRaw) ? scopeRaw : undefined;

  return {
    q: q || undefined,
    date,
    from,
    to,
    district,
    category,
    sort,
    scope,
  };
}

function isSortKey(value: string | undefined): value is SortKey {
  return value === "date" || value === "upcoming";
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

function isSearchScope(value: string | undefined): value is DiscoverySearchScope {
  return value === "event" || value === "artist" || value === "venue";
}

export function buildDiscoveryQueryString(
  params: DiscoverySearchParams,
  options?: { omitDefaultSort?: boolean }
): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.date) sp.set("date", params.date);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.district) sp.set("district", params.district);
  if (params.category) sp.set("category", params.category);
  if (params.scope && params.scope !== "event") sp.set("scope", params.scope);
  if (params.sort && !(options?.omitDefaultSort && params.sort === "date")) {
    sp.set("sort", params.sort);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** Query object for next-intl Link — omits empty values and default sort. */
export function toDiscoveryQueryObject(
  params: DiscoverySearchParams
): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.date) query.date = params.date;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.district) query.district = params.district;
  if (params.category) query.category = params.category;
  if (params.scope && params.scope !== "event") query.scope = params.scope;
  if (params.sort && params.sort !== "date") query.sort = params.sort;
  return query;
}

export function omitDiscoveryParam(
  params: DiscoverySearchParams,
  key: "q" | "date" | "district" | "category" | "from" | "to" | "scope"
): DiscoverySearchParams {
  const next = { ...params };
  delete next[key];
  return next;
}

export function hasActiveDiscoveryFilters(params: DiscoverySearchParams): boolean {
  return Boolean(
    params.q ||
      params.date ||
      params.from ||
      params.to ||
      params.district ||
      params.category ||
      (params.scope && params.scope !== "event")
  );
}

export function countActiveDiscoveryFilters(params: DiscoverySearchParams): number {
  let count = 0;
  if (params.q) count += 1;
  if (params.date) count += 1;
  if (params.from || params.to) count += 1;
  if (params.district) count += 1;
  if (params.category) count += 1;
  return count;
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
