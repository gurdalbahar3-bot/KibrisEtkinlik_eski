import { DISTRICT_SLUGS } from "@/lib/data/categories";
import { normalizeDistrictSlug } from "@/lib/admin/intake/normalize";
import type { DistrictSlug } from "@/types/event";

const DISTRICT_DIACRITICS: Record<string, string> = {
  ş: "s",
  ı: "i",
  ğ: "g",
  ü: "u",
  ö: "o",
  ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

/** Fold TR/EN spelling onto the existing district gazetteer. */
export function foldDistrictToken(value: string): string {
  return normalizeDistrictSlug(value)
    .split("")
    .map((character) => DISTRICT_DIACRITICS[character] ?? character)
    .join("");
}

const DISTRICT_ALIASES: Record<string, DistrictSlug> = {
  lefkosa: "lefkosa",
  lefkosha: "lefkosa",
  nicosia: "lefkosa",
  girne: "girne",
  kyrenia: "girne",
  gazimagusa: "gazimagusa",
  famagusta: "gazimagusa",
  magosa: "gazimagusa",
  magusa: "gazimagusa",
  guzelyurt: "guzelyurt",
  morphou: "guzelyurt",
  lefke: "lefke",
  iskele: "iskele",
  trikomo: "iskele",
};

export function resolveSpiderDistrict(rawDistrict?: string): DistrictSlug {
  if (!rawDistrict?.trim()) {
    throw new Error("Spider intake requires rawDistrict.");
  }
  const slug = foldDistrictToken(rawDistrict);
  if (DISTRICT_SLUGS.includes(slug as DistrictSlug)) {
    return slug as DistrictSlug;
  }
  const alias = DISTRICT_ALIASES[slug];
  if (alias) {
    return alias;
  }
  throw new Error(`Unsupported spider district: ${rawDistrict}`);
}

export function tryResolveSpiderDistrict(rawDistrict?: string): DistrictSlug | undefined {
  try {
    return resolveSpiderDistrict(rawDistrict);
  } catch {
    return undefined;
  }
}
