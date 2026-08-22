import type { EventCategory, DistrictSlug } from "@/types/event";

/** Homepage category order — all 10 categories in display sequence. */
export const HOMEPAGE_CURATED_CATEGORIES: EventCategory[] = [
  "concert",
  "theater",
  "standup",
  "art-culture",
  "festival",
  "nightlife",
  "sports",
  "family",
  "wedding",
  "other",
];

export const CATEGORY_KEYS: EventCategory[] = [
  "concert",
  "festival",
  "theater",
  "standup",
  "nightlife",
  "sports",
  "family",
  "art-culture",
  "wedding",
  "other",
];

export const DISTRICT_SLUGS: DistrictSlug[] = [
  "lefkosa",
  "girne",
  "gazimagusa",
  "guzelyurt",
  "lefke",
  "iskele",
];

export const CATEGORY_ICONS: Record<EventCategory, string> = {
  concert: "🎵",
  festival: "🎪",
  theater: "🎭",
  standup: "🎤",
  nightlife: "🌙",
  sports: "⚽",
  family: "👨‍👩‍👧",
  "art-culture": "🎨",
  wedding: "💒",
  other: "✨",
};

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  concert: "from-violet-500 to-purple-600",
  festival: "from-orange-400 to-red-500",
  theater: "from-rose-400 to-pink-600",
  standup: "from-amber-400 to-orange-500",
  nightlife: "from-indigo-600 to-brand-800",
  sports: "from-emerald-400 to-teal-600",
  family: "from-sky-400 to-blue-500",
  "art-culture": "from-fuchsia-400 to-purple-500",
  wedding: "from-pink-300 to-rose-400",
  other: "from-slate-400 to-slate-600",
};

/** Soft pastel chip backgrounds for homepage category discovery. */
export const CATEGORY_PASTELS: Record<EventCategory, string> = {
  concert: "bg-fuchsia-50 hover:bg-fuchsia-100",
  festival: "bg-orange-50 hover:bg-orange-100",
  theater: "bg-rose-50 hover:bg-rose-100",
  standup: "bg-amber-50 hover:bg-amber-100",
  nightlife: "bg-indigo-50 hover:bg-indigo-100",
  sports: "bg-emerald-50 hover:bg-emerald-100",
  family: "bg-sky-50 hover:bg-sky-100",
  "art-culture": "bg-purple-50 hover:bg-purple-100",
  wedding: "bg-pink-50 hover:bg-pink-100",
  other: "bg-slate-50 hover:bg-slate-100",
};
