import { resolveSpiderDistrict } from "@/lib/admin/intake/district";
import { normalizeEventTitle } from "@/lib/admin/intake/normalize";
import type { DistrictSlug } from "@/types/event";

const TICKET_NOISE =
  /\b(tickets?|biletleri?|bilet|buy tickets|satin al|satın al|passo|biletix|eventbrite)\b/g;
const SEPARATORS = /[-–—:|/]+/g;

/** Ticket-site wording is noise — those listings are sources, not new events. */
export function canonicalizeEventTitle(title: string): string {
  return normalizeEventTitle(title)
    .replace(TICKET_NOISE, " ")
    .replace(SEPARATORS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeEventDistrict(district: string): DistrictSlug {
  return resolveSpiderDistrict(district);
}

/**
 * One canonical identity for spider + admin fingerprint:
 * title + canonical district. Date/venue stay as evidence/contradiction.
 */
export function buildCanonicalEventIdentityKey(title: string, district: string): string {
  return `${canonicalizeEventTitle(title)}|${canonicalizeEventDistrict(district)}`;
}
