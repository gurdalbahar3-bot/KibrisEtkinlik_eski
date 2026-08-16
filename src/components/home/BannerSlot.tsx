import Image from "next/image";
import { useTranslations } from "next-intl";
import type { BannerSlotConfig } from "@/types/banner";

interface BannerSlotProps {
  slot: BannerSlotConfig;
}

export function BannerSlot({ slot }: BannerSlotProps) {
  const t = useTranslations("bannerSlots");

  if (!slot.enabled) {
    return null;
  }

  const label = slot.labelKey ? t(slot.labelKey) : t("default");

  if (slot.imageUrl && slot.href) {
    return (
      <aside
        className="section-container py-6 sm:py-8"
        aria-label={label}
        data-banner-id={slot.id}
      >
        <a
          href={slot.href}
          className="block overflow-hidden rounded-2xl shadow-card transition hover:shadow-card-hover"
          target="_blank"
          rel="noopener noreferrer sponsored"
        >
          <div className="relative aspect-[21/5] w-full sm:aspect-[21/4]">
            <Image
              src={slot.imageUrl}
              alt={slot.imageAlt ?? label}
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
            />
          </div>
        </a>
      </aside>
    );
  }

  return (
    <aside
      className="section-container py-6 sm:py-8"
      aria-label={label}
      data-banner-id={slot.id}
    >
      <div className="flex min-h-[5rem] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-400">
        {label}
      </div>
    </aside>
  );
}
