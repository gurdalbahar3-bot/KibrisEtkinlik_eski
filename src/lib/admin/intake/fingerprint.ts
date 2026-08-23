import { normalizeSearchText } from "@/lib/admin/intake/normalize";

export interface IntakeFingerprintInput {
  title: string;
  district: string;
  venue?: string;
  startsAt?: string;
}

/** Deterministic fingerprint for duplicate preparation — not an AI duplicate system. */
export function createIntakeFingerprint(input: IntakeFingerprintInput): string {
  const parts = [
    normalizeSearchText(input.title),
    input.district.trim().toLowerCase(),
    input.venue ? normalizeSearchText(input.venue) : "",
    input.startsAt?.trim() ?? "",
  ];
  return parts.join("|");
}
