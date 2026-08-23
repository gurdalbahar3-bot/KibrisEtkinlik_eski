import { buildCanonicalEventIdentityKey } from "@/lib/admin/intake/canonical-identity";

export interface IntakeFingerprintInput {
  title: string;
  district: string;
  venue?: string;
  startsAt?: string;
}

/**
 * Canonical event identity: title + district only.
 * Date/venue are ignored so variants stay on the same record.
 */
export function createIntakeFingerprint(input: IntakeFingerprintInput): string {
  return buildCanonicalEventIdentityKey(input.title, input.district);
}
