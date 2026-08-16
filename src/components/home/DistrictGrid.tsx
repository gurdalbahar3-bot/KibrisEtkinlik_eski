import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { PosterImage } from "@/components/ui/PosterImage";
import { districtsRepository } from "@/lib/data/events";
interface DistrictGridProps {
  showHeader?: boolean;
}

export function DistrictGrid({ showHeader = true }: DistrictGridProps) {
  const t = useTranslations("districtsSection");
  const tDist = useTranslations("districts");
  const districts = districtsRepository.getAll();

  return (
    <section id="ilceler" className={showHeader ? "bg-slate-50 py-12 sm:py-16" : ""} aria-labelledby={showHeader ? "districts-title" : undefined}>
      <div className={showHeader ? "section-container" : ""}>
        {showHeader && (
          <header className="mb-8">
            <h2 id="districts-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </header>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {districts.map((district) => (
            <li key={district.slug}>
              <Link
                href={{
                  pathname: "/events/[slug]",
                  params: { slug: district.slug },
                }}
                className="group relative flex h-44 overflow-hidden rounded-2xl shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover sm:h-48"
              >
                <PosterImage
                  src={district.image}
                  alt={tDist(district.slug)}
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="relative mt-auto p-5 text-white">
                  <h3 className="text-xl font-bold">{tDist(district.slug)}</h3>
                  <p className="mt-1 text-sm text-white/80">
                    {t("eventCount", { count: district.eventCount })}
                  </p>
                  <span className="mt-2 inline-block text-sm font-semibold text-accent-400 group-hover:underline">
                    {t("explore")} →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
