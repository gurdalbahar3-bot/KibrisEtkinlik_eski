/** Deterministic text normalization — no AI or fuzzy matching. */

const MULTI_SPACE = /\s+/g;
const TRAILING_PUNCT = /[.,;:!?]+$/;

export function normalizeEventTitle(value: string): string {
  return normalizeSearchText(value);
}

export function normalizeVenueName(value: string): string {
  return normalizeSearchText(value);
}

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(MULTI_SPACE, " ")
    .replace(TRAILING_PUNCT, "")
    .toLowerCase();
}

export function normalizeDistrictSlug(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "-");
}

export function normalizeCategorySlug(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "-");
}
