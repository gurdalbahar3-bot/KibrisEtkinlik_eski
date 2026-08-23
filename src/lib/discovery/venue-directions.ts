import type { DiscoveryEvent, DiscoveryVenue } from "@/types/event";

export type MapsVendor = "google" | "apple";

/** Vendor-agnostic destination. Build URLs from this — do not return a Google href from helpers. */
export interface MapsDestination {
  lat?: number;
  lng?: number;
  query: string;
}

type VenueDirectionsInput = Pick<DiscoveryVenue, "name" | "district" | "location">;
type EventDirectionsInput = Pick<DiscoveryEvent, "venue" | "district">;

function hasFiniteCoords(
  location: VenueDirectionsInput["location"] | undefined
): location is { latitude: number; longitude: number } {
  return (
    location != null &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  );
}

function trimText(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Name + district + KKTC fallback (venue-mapper contract). */
function buildSearchQuery(name: string, district: string): string {
  return [name, district, "KKTC"].filter(Boolean).join(" ");
}

function toDestination(
  name: string,
  district: string,
  location: VenueDirectionsInput["location"] | undefined
): MapsDestination | null {
  const coords = hasFiniteCoords(location);
  if (!coords && !name && !district) {
    return null;
  }

  const destination: MapsDestination = {
    query: buildSearchQuery(name, district),
  };

  if (coords) {
    destination.lat = location.latitude;
    destination.lng = location.longitude;
  }

  return destination;
}

export function hasUsableMapsDestination(
  destination: MapsDestination | null | undefined
): destination is MapsDestination {
  if (!destination) return false;
  const hasCoords =
    destination.lat !== undefined &&
    destination.lng !== undefined &&
    Number.isFinite(destination.lat) &&
    Number.isFinite(destination.lng);
  return hasCoords || Boolean(destination.query.trim());
}

export function buildVenueMapsDestination(
  venue: VenueDirectionsInput
): MapsDestination | null {
  return toDestination(trimText(venue.name), trimText(venue.district), venue.location);
}

export function buildEventMapsDestination(
  event: EventDirectionsInput,
  venue?: VenueDirectionsInput | null
): MapsDestination | null {
  const name = trimText(venue?.name) || trimText(event.venue);
  const district = trimText(event.district) || trimText(venue?.district);
  return toDestination(name, district, venue?.location);
}

export function buildMapsUrl(destination: MapsDestination, vendor: MapsVendor): string {
  return vendor === "apple"
    ? buildAppleMapsUrl(destination)
    : buildGoogleMapsUrl(destination);
}

function buildGoogleMapsUrl(destination: MapsDestination): string {
  if (
    destination.lat !== undefined &&
    destination.lng !== undefined &&
    Number.isFinite(destination.lat) &&
    Number.isFinite(destination.lng)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lng}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination.query)}`;
}

function buildAppleMapsUrl(destination: MapsDestination): string {
  const params = new URLSearchParams();

  if (
    destination.lat !== undefined &&
    destination.lng !== undefined &&
    Number.isFinite(destination.lat) &&
    Number.isFinite(destination.lng)
  ) {
    params.set("ll", `${destination.lat},${destination.lng}`);
  }

  const query = destination.query.trim();
  if (query) {
    params.set("q", query);
  }

  return `https://maps.apple.com/?${params.toString()}`;
}
