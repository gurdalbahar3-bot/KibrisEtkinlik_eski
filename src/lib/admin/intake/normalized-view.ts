import {
  normalizeEventTitle,
  normalizeSearchText,
  normalizeVenueName,
} from "@/lib/admin/intake/normalize";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import { formatDistrictLabel } from "@/lib/admin/format";

export interface NormalizedIntakeView {
  title: string;
  description?: string;
  districtLabel: string;
  venue?: string;
  category?: string;
  startsAt?: string;
  artist?: string;
  searchText: string;
}

export function buildNormalizedIntakeView(
  intake: DiscoveredEventIntake,
  locale: "tr" | "en" = "tr"
): NormalizedIntakeView {
  const title = normalizeEventTitle(intake.rawTitle);
  const description = intake.rawDescription
    ? normalizeSearchText(intake.rawDescription)
    : undefined;
  const venue = intake.suggestedVenueId
    ? normalizeVenueName(intake.suggestedVenueId.replace(/-/g, " "))
    : undefined;

  return {
    title,
    description,
    districtLabel: formatDistrictLabel(intake.suggestedDistrictId, locale),
    venue,
    category: intake.suggestedCategory,
    startsAt: intake.suggestedStartsAt,
    artist: intake.artist ? normalizeSearchText(intake.artist) : undefined,
    searchText: [title, venue, intake.artist, intake.suggestedCategory]
      .filter(Boolean)
      .join(" "),
  };
}
