import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { getEventImage, getEventImageSources } from "@/lib/ui/event-image";
import { PosterImage } from "@/components/ui/PosterImage";
import { DiscoveryHeroSearch } from "@/components/home/DiscoveryHeroSearch";
import { formatEventDate } from "@/lib/seo/jsonld";
import type { DiscoveryEvent } from "@/types/event";
import type { Locale } from "@/lib/i18n/routing";

interface DiscoveryHeroProps {
  spotlight?: DiscoveryEvent | null;
}

export async function DiscoveryHero({ spotlight = null }: DiscoveryHeroProps) {
  const t = await getTranslations("hero");
  const tCat = await getTranslations("categories");
  const tDist = await getTranslations("districts");
  const locale = (await getLocale()) as Locale;

  const imageSrc = spotlight ? getEventImage(spotlight) : "";
  const fallbackSources = spotlight
    ? getEventImageSources(spotlight).filter((url) => url !== imageSrc)
    : [];

  return (
    <section
      className="relative overflow-hidden bg-platform-navy text-white min-h-[420px] sm:min-h-[460px] lg:min-h-[500px]"
      aria-labelledby="discovery-hero-title"
    >
      <div className="absolute inset-0">
        {spotlight ? (
          <PosterImage
            src={imageSrc}
            fallbackSources={fallbackSources}
            alt=""
            sizes="100vw"
            className="object-cover object-center"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-platform-navy via-brand-900 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-platform-navy/95 from-0% via-platform-navy/70 via-[42%] to-platform-navy/20 to-100%" />
        <div className="absolute inset-0 bg-gradient-to-t from-platform-navy/55 via-transparent to-transparent" />
      </div>

      <div className="section-container relative flex h-full min-h-[inherit] items-center py-10 sm:py-12 lg:py-14">
        <div className="max-w-2xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-accent-400">
            {t("discoveryLabel")}
          </p>
          <h1
            id="discovery-hero-title"
            className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3rem]"
          >
            {t("title")}
          </h1>
          <p className="mt-4 max-w-lg text-base text-white/85 sm:text-lg">{t("subtitle")}</p>

          <DiscoveryHeroSearch />

          {spotlight && (
            <SpotlightChip
              spotlight={spotlight}
              locale={locale}
              categoryLabel={tCat(spotlight.category)}
              districtLabel={tDist(spotlight.district)}
              spotlightLabel={t("spotlightLabel")}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SpotlightChip({
  spotlight,
  locale,
  categoryLabel,
  districtLabel,
  spotlightLabel,
}: {
  spotlight: DiscoveryEvent;
  locale: Locale;
  categoryLabel: string;
  districtLabel: string;
  spotlightLabel: string;
}) {
  const { day, month } = formatEventDate(spotlight.date, locale);

  return (
    <Link
      href={{ pathname: "/events/[slug]", params: { slug: spotlight.slug } }}
      className="mt-6 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm backdrop-blur-sm transition hover:border-white/35 hover:bg-white/15 sm:mt-7"
    >
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-accent-300">
        {spotlightLabel}
      </span>
      <span className="text-white/40" aria-hidden>
        ·
      </span>
      <span className="shrink-0 font-semibold text-accent-200">{categoryLabel}</span>
      <span className="text-white/40" aria-hidden>
        ·
      </span>
      <span className="truncate font-medium text-white">{spotlight.title}</span>
      <span className="text-white/40" aria-hidden>
        ·
      </span>
      <span className="shrink-0 text-white/75">
        {districtLabel} · {day} {month}
      </span>
    </Link>
  );
}
