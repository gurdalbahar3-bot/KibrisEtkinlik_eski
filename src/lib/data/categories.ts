import type { EventCategory, DistrictSlug } from "@/types/event";

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
