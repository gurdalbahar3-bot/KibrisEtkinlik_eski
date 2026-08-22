export type EventCategory =
  | "concert"
  | "festival"
  | "theater"
  | "standup"
  | "nightlife"
  | "sports"
  | "family"
  | "art-culture"
  | "wedding"
  | "other";

export type DistrictSlug =
  | "lefkosa"
  | "girne"
  | "gazimagusa"
  | "guzelyurt"
  | "lefke"
  | "iskele";

export interface DiscoveryEvent {
  id: string;
  title: string;
  slug: string;
  /** Display URL — may be a category/generic placeholder when no real cover exists. */
  poster: string;
  /** Real Supabase `cover_image_url` only. Never a UI placeholder. */
  coverImageUrl?: string;
  /** True only when `coverImageUrl` is present (real cover). */
  hasRealCover?: boolean;
  date: string;
  startTime: string;
  venue: string;
  venueSlug: string;
  district: DistrictSlug;
  category: EventCategory;
  description: string;
  isFree: boolean;
  isPopular?: boolean;
  artist?: string;
  officialTicketUrl?: string;
}

export interface DiscoveryVenue {
  id: string;
  name: string;
  slug: string;
  photo: string;
  district: DistrictSlug;
  venueType: string;
  upcomingEventCount: number;
  /** Optional coordinates for map navigation; search fallback uses name + district. */
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface DistrictInfo {
  slug: DistrictSlug;
  eventCount: number;
  image: string;
}

export type QuickFilterKey =
  | "today"
  | "tomorrow"
  | "weekend"
  | "thisWeek"
  | "thisMonth";
