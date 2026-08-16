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
  poster: string;
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
