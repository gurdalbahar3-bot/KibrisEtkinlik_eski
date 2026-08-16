export interface BannerSlotConfig {
  id: string;
  /** When false the slot renders nothing (ready for future campaigns). */
  enabled: boolean;
  href?: string;
  imageUrl?: string;
  imageAlt?: string;
  /** TR/EN message key under `bannerSlots` namespace */
  labelKey?: string;
}
