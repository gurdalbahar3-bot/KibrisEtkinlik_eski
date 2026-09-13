import { getTranslations } from "next-intl/server";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { PosterImage } from "@/components/ui/PosterImage";
import { DiscoveryHeroSearch } from "@/components/home/DiscoveryHeroSearch";
import { HeroSpotlightCard } from "@/components/home/HeroSpotlightCard";
import type { DiscoveryEvent } from "@/types/event";

interface DiscoveryHeroProps {
  spotlight?: DiscoveryEvent | null;
}

export async function DiscoveryHero({ spotlight = null }: DiscoveryHeroProps) {
  const t = await getTranslations("hero");

  const imageSrc = spotlight ? getEventImage(spotlight) : "";
  const fallbackSources = spotlight
    ? getEventImageSources(spotlight).filter((url) => url !== imageSrc)
    : [];

  return (
    <section
      className="relative overflow-hidden bg-platform-navy text-white"
      aria-labelledby="discovery-hero-title"
    >
      <div className="absolute inset-0">
        {spotlight ? (
          <PosterImage
            src={imageSrc}
            fallbackSources={fallbackSources}
            alt=""
            sizes="100vw"
            className="object-cover object-center scale-105"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-platform-navy via-brand-900 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-platform-navy/96 via-platform-navy/82 to-platform-navy/55 lg:to-platform-navy/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-platform-navy/80 via-platform-navy/20 to-transparent" />
      </div>

      <div className="section-container relative py-10 sm:py-12 lg:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,380px)] lg:gap-10 xl:gap-14">
          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-accent-400">
              {t("discoveryLabel")}
            </p>
            <h1
              id="discovery-hero-title"
              className="text-balance text-[2rem] font-extrabold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]"
            >
              {t("title")}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-white/85 sm:mt-4 sm:text-lg">
              {t("subtitle")}
            </p>

            <DiscoveryHeroSearch />
          </div>

          {spotlight ? (
            <div className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none">
              <HeroSpotlightCard event={spotlight} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
