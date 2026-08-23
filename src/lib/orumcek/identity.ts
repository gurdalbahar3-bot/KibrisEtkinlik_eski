import { normalizeDistrictSlug, normalizeEventTitle, normalizeVenueName } from "@/lib/admin/intake/normalize";
import type { EventIdentity, RawObservation } from "@/lib/orumcek/types";

const TICKET_NOISE =
  /\b(tickets?|biletleri?|bilet|buy tickets|satin al|satın al|passo|biletix|eventbrite)\b/g;
const SEPARATORS = /[-–—:|/]+/g;

/** Ticket-site wording is noise — those listings are sources, not new events. */
export function normalizeIdentityTitle(title: string): string {
  return normalizeEventTitle(title)
    .replace(TICKET_NOISE, " ")
    .replace(SEPARATORS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdentityDistrict(district: string): string {
  return normalizeDistrictSlug(district);
}

export function normalizeIdentityVenue(venue?: string): string | undefined {
  if (!venue?.trim()) {
    return undefined;
  }
  return normalizeVenueName(venue);
}

export function normalizeIdentityDate(rawDate?: string, startsAt?: string): string | undefined {
  const candidate = rawDate?.trim() || startsAt?.trim();
  if (!candidate) {
    return undefined;
  }
  const isoDay = candidate.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoDay ? isoDay[1] : candidate.slice(0, 10);
}

/**
 * Same real event = one record. Key is title + district so ticket listings
 * and date disagreements still collapse onto one identity.
 */
export function buildIdentityKey(title: string, district: string): string {
  return `${normalizeIdentityTitle(title)}|${normalizeIdentityDistrict(district)}`;
}

export function identityKeyFromObservation(observation: RawObservation): string {
  const district = observation.raw.rawDistrict?.trim();
  if (!district) {
    throw new Error("Observation requires rawDistrict to resolve event identity.");
  }
  return buildIdentityKey(observation.raw.rawTitle, district);
}

export function createEventIdentity(
  id: string,
  observation: RawObservation,
  intakeId?: string
): EventIdentity {
  const district = normalizeIdentityDistrict(observation.raw.rawDistrict ?? "");
  return {
    id,
    identityKey: identityKeyFromObservation(observation),
    titleNormalized: normalizeIdentityTitle(observation.raw.rawTitle),
    district,
    intakeId,
    observationIds: [observation.id],
  };
}

export function findMatchingIdentity(
  identities: EventIdentity[],
  observation: RawObservation
): EventIdentity | undefined {
  const key = identityKeyFromObservation(observation);
  return identities.find((identity) => identity.identityKey === key);
}
