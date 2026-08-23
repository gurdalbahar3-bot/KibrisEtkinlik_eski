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
  /** Primary / first artist — list cards keep this single field. */
  artist?: string;
  /** All linked artists, already sorted by `event_artists.sort_order`. */
  artists?: string[];
  officialTicketUrl?: string;
}

export type TicketSaleMode = "ticket_based" | "seat_based";

/** Public, read-only catalog row from `event_ticket_types` + zone (014). */
export interface DiscoveryTicketOffer {
  id: string;
  name: string;
  zoneName: string;
  zoneType: string;
  saleMode: TicketSaleMode;
  price: number;
  description?: string;
  /** Remaining capacity when `sale_mode = ticket_based`. */
  remaining?: number;
  isSoldOut: boolean;
}

export interface DiscoveryVenue {
  id: string;
  name: string;
  slug: string;
  photo: string;
  district: DistrictSlug;
  venueType: string;
  upcomingEventCount: number;
  /** Optional street/city line from `venues.address` / city / region. */
  address?: string;
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
