import type { BannerSlotConfig } from "@/types/banner";

/** Homepage banner inventory — enable slots when campaigns are ready. */
export const HOME_BANNER_SLOTS = {
  afterToday: {
    id: "home-after-today",
    enabled: false,
    labelKey: "afterToday",
  },
  beforeVenues: {
    id: "home-before-venues",
    enabled: false,
    labelKey: "beforeVenues",
  },
} satisfies Record<string, BannerSlotConfig>;
