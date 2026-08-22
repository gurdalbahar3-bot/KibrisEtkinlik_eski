/** URL-safe slug from display text (TR diacritics stripped). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Stable public slug for an event (title + id prefix). */
export function eventSlug(title: string, id: string): string {
  const base = slugify(title);
  const suffix = id.replace(/-/g, "").slice(0, 8);
  return base ? `${base}-${suffix}` : id;
}

/** Stable public slug for a venue. */
export function venueSlug(name: string, id: string): string {
  const base = slugify(name);
  const suffix = id.replace(/-/g, "").slice(0, 8);
  return base ? `${base}-${suffix}` : id;
}
