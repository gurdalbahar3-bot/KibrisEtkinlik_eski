import { CATEGORY_KEYS } from "@/lib/data/categories";
import { MEDIA } from "@/lib/data/media-urls";
import { eventSlug, venueSlug } from "@/lib/utils/slugify";
import { getCyprusDateString } from "@/lib/discovery/cyprus-date";
import type {
  DiscoveryEvent,
  DiscoveryVenue,
  DistrictInfo,
  DistrictSlug,
  EventCategory,
} from "@/types/event";

const PUBLISHED_STATUSES = ["published", "postponed", "completed"] as const;

export { PUBLISHED_STATUSES };

type DbEventRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  is_free: boolean;
  starts_at: string;
  cover_image_url: string | null;
  venue: {
    id: string;
    name: string;
    venue_category: string | null;
    district_id: string | null;
    kktc_districts: { code: string } | null;
  } | null;
  event_locations: {
    district_id: string | null;
    kktc_districts: { code: string } | null;
  } | null;
};

type DbVenueRow = {
  id: string;
  name: string;
  venue_category: string | null;
  floor_plan_url: string | null;
  kktc_districts: { code: string } | null;
  upcoming_count?: number;
};

const DISTRICT_IMAGES: Record<DistrictSlug, string> = MEDIA.districts;

function normalizeCategory(raw: string): EventCategory {
  const key = raw.toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (CATEGORY_KEYS.includes(key as EventCategory)) {
    return key as EventCategory;
  }
  if (key.includes("concert") || key.includes("konser")) return "concert";
  if (key.includes("festival")) return "festival";
  if (key.includes("theater") || key.includes("tiyatro")) return "theater";
  if (key.includes("stand")) return "standup";
  if (key.includes("night") || key.includes("party") || key.includes("gece")) return "nightlife";
  if (key.includes("sport")) return "sports";
  if (key.includes("family") || key.includes("child") || key.includes("cocuk")) return "family";
  if (key.includes("art") || key.includes("culture") || key.includes("sanat")) return "art-culture";
  if (key.includes("wedding") || key.includes("dugun")) return "wedding";
  return "other";
}

function resolveDistrict(row: DbEventRow): DistrictSlug {
  const code =
    row.event_locations?.kktc_districts?.code ??
    row.venue?.kktc_districts?.code ??
    "lefkosa";
  return code as DistrictSlug;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDate(iso: string): string {
  return getCyprusDateString(new Date(iso));
}

function posterForCategory(category: EventCategory, coverUrl: string | null): string {
  if (coverUrl) return coverUrl;
  const map: Partial<Record<EventCategory, string>> = {
    concert: MEDIA.posters.concertSunset,
    festival: MEDIA.posters.festivalCrowd,
    theater: MEDIA.posters.theater,
    standup: MEDIA.posters.standup,
    nightlife: MEDIA.posters.nightlife,
    sports: MEDIA.posters.sports,
    family: MEDIA.posters.family,
    "art-culture": MEDIA.posters.art,
  };
  return map[category] ?? MEDIA.posters.fallback;
}

export function mapDbEvent(row: DbEventRow): DiscoveryEvent {
  const category = normalizeCategory(row.category);
  const district = resolveDistrict(row);
  const venueName = row.venue?.name ?? "";
  const venueId = row.venue?.id ?? row.id;

  return {
    id: row.id,
    title: row.title,
    slug: eventSlug(row.title, row.id),
    poster: posterForCategory(category, row.cover_image_url),
    date: formatDate(row.starts_at),
    startTime: formatTime(row.starts_at),
    venue: venueName,
    venueSlug: venueSlug(venueName, venueId),
    district,
    category,
    description: row.description ?? "",
    isFree: row.is_free,
  };
}

function mapVenueType(raw: string | null): string {
  switch (raw) {
    case "theater":
      return "culture";
    case "club":
      return "arena";
    case "restaurant":
    case "hotel":
      return "outdoor";
    default:
      return "outdoor";
  }
}

export function mapDbVenue(row: DbVenueRow): DiscoveryVenue {
  const district = (row.kktc_districts?.code ?? "lefkosa") as DistrictSlug;
  return {
    id: row.id,
    name: row.name,
    slug: venueSlug(row.name, row.id),
    photo: row.floor_plan_url ?? MEDIA.venues.bellapais,
    district,
    venueType: mapVenueType(row.venue_category),
    upcomingEventCount: row.upcoming_count ?? 0,
  };
}

export function mapDistrict(code: DistrictSlug, eventCount: number): DistrictInfo {
  return {
    slug: code,
    eventCount,
    image: DISTRICT_IMAGES[code] ?? MEDIA.districts.lefkosa,
  };
}
