import { MEDIA } from "@/lib/data/media-urls";
import type { DbKktcDistrictRow } from "@/types/supabase/database";
import type { DistrictInfo, DistrictSlug } from "@/types/event";

export function mapDistrictRowToDistrictInfo(
  row: DbKktcDistrictRow,
  eventCount = 0
): DistrictInfo {
  const slug = row.code as DistrictSlug;
  const image =
    slug in MEDIA.districts
      ? MEDIA.districts[slug as keyof typeof MEDIA.districts]
      : MEDIA.districts.lefkosa;

  return {
    slug,
    eventCount,
    image,
  };
}

export function mapDistrictRowsToDistrictInfo(
  rows: DbKktcDistrictRow[],
  eventCounts: Readonly<Partial<Record<DistrictSlug, number>>> = {}
): DistrictInfo[] {
  return rows
    .filter((row) => row.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) =>
      mapDistrictRowToDistrictInfo(row, eventCounts[row.code as DistrictSlug] ?? 0)
    );
}

/** Locale-aware district display name (for future i18n helpers). */
export function getDistrictDisplayName(
  row: DbKktcDistrictRow,
  locale: "tr" | "en" = "tr"
): string {
  return locale === "en" ? row.name_en : row.name_tr;
}
