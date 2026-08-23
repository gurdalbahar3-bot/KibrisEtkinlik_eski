import {
  buildCanonicalEventIdentityKey,
  canonicalizeEventDistrict,
  canonicalizeEventTitle,
} from "@/lib/admin/intake/canonical-identity";
import { normalizeVenueName } from "@/lib/admin/intake/normalize";
import type { EventIdentity, RawObservation } from "@/lib/orumcek/types";

export function normalizeIdentityTitle(title: string): string {
  return canonicalizeEventTitle(title);
}

export function normalizeIdentityDistrict(district: string): string {
  return canonicalizeEventDistrict(district);
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
 * Same real event = one record. Key is canonical title + district.
 * Date/venue differences stay on this identity as contradiction/evidence.
 */
export function buildIdentityKey(title: string, district: string): string {
  return buildCanonicalEventIdentityKey(title, district);
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
  return {
    id,
    identityKey: identityKeyFromObservation(observation),
    titleNormalized: normalizeIdentityTitle(observation.raw.rawTitle),
    district: normalizeIdentityDistrict(observation.raw.rawDistrict ?? ""),
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
