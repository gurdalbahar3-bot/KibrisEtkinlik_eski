import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PosterImage } from "@/components/ui/PosterImage";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { DistrictInfo, DistrictSlug } from "@/types/event";

/** Homepage order: Girne, Lefkoşa, İskele, Gazimağusa, Güzelyurt, Lefke */
const HOMEPAGE_DISTRICT_ORDER: DistrictSlug[] = [
  "girne",
  "lefkosa",
  "iskele",
  "gazimagusa",
  "guzelyurt",
  "lefke",
];

interface DistrictGridProps {
  showHeader?: boolean;
  variant?: "homepage" | "full";
  /** Required — no silent mock fallback. */
  districts: DistrictInfo[];
}

export async function DistrictGrid({
  showHeader = true,
  variant = "homepage",
  districts: preloadedDistricts,
}: DistrictGridProps) {
  const t = await getTranslations("districtsSection");
  const tDist = await getTranslations("districts");
  const districtBySlug = new Map(preloadedDistricts.map((d) => [d.slug, d]));

  const districts =
    variant === "homepage"
      ? HOMEPAGE_DISTRICT_ORDER.map((slug) => districtBySlug.get(slug)).filter(
          (d): d is NonNullable<typeof d> => d != null
        )
      : preloadedDistricts;

  if (districts.length === 0) return null;

  if (variant === "full") {
    return (
      <section id="ilceler" aria-labelledby={showHeader ? "districts-title" : undefined}>
        <div className={showHeader ? "section-container" : ""}>
          {showHeader && (
            <header className="mb-8">
              <h2 id="districts-title" className="section-title">
                {t("titleFull")}
              </h2>
              <p className="section-subtitle">{t("subtitleFull")}</p>
            </header>
          )}

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {districts.map((district) => (
              <li key={district.slug}>
                <Link
                  href={{ pathname: "/events", query: { district: district.slug } }}
                  className="discovery-card group relative flex h-44 sm:h-48"
                >
                  <PosterImage
                    src={district.image}
                    alt={tDist(district.slug)}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="discovery-overlay" />
                  <div className="relative mt-auto p-5 text-white">
                    <h3 className="text-xl font-bold">{tDist(district.slug)}</h3>
                    <p className="mt-1 text-sm text-white/80">
                      {t("eventCount", { count: district.eventCount })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section id="bolge-kesfi" className="section-surface-white section-padding" aria-labelledby="districts-title">
      <div className="section-container">
        {showHeader && (
          <SectionHeader
            title={t("title")}
            subtitle={t("subtitle")}
            titleId="districts-title"
            cta={{ href: "/districts", label: t("viewAll") }}
            className="section-header-gap"
          />
        )}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {districts.map((district) => (
            <li key={district.slug}>
              <Link
                href={{ pathname: "/events", query: { district: district.slug } }}
                className="group flex min-h-[56px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white px-3 py-3.5 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-slate-50/80 hover:shadow-card"
              >
                <span className="flex items-center gap-1 text-sm font-bold text-platform-navy">
                  <PinIcon />
                  {tDist(district.slug)}
                </span>
                <span className="mt-1 text-[11px] font-medium text-slate-500">
                  {t("eventCount", { count: district.eventCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PinIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-accent-500"
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
