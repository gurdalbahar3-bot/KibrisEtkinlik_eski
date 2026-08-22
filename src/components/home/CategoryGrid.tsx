import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  CATEGORY_ICONS,
  CATEGORY_KEYS,
  CATEGORY_PASTELS,
  HOMEPAGE_CURATED_CATEGORIES,
} from "@/lib/data/categories";
import type { EventCategory } from "@/types/event";

interface CategoryGridProps {
  showHeader?: boolean;
  variant?: "homepage" | "full";
  /** Required counts from discovery loader — no silent mock fallback. */
  categoryCounts: Partial<Record<EventCategory, number>>;
}

export async function CategoryGrid({
  showHeader = true,
  variant = "homepage",
  categoryCounts: preloadedCounts,
}: CategoryGridProps) {
  const t = await getTranslations("categoriesSection");
  const tCat = await getTranslations("categories");
  const categories = variant === "full" ? CATEGORY_KEYS : HOMEPAGE_CURATED_CATEGORIES;

  const counts = (categories as EventCategory[]).reduce(
    (acc, key) => {
      acc[key] = preloadedCounts[key] ?? 0;
      return acc;
    },
    {} as Record<EventCategory, number>
  );

  if (variant === "full") {
    return (
      <section id="kategoriler" aria-labelledby={showHeader ? "categories-title" : undefined}>
        <div className={showHeader ? "section-container" : ""}>
          {showHeader && (
            <header className="mb-8">
              <h2 id="categories-title" className="section-title">
                {t("title")}
              </h2>
              <p className="section-subtitle">{t("subtitle")}</p>
            </header>
          )}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((key) => (
              <li key={key}>
                <Link
                  href={{ pathname: "/categories/[category]", params: { category: key } }}
                  className={`category-chip ${CATEGORY_PASTELS[key]} min-h-[108px]`}
                >
                  <span className="text-2xl" aria-hidden>
                    {CATEGORY_ICONS[key]}
                  </span>
                  <span className="text-sm font-semibold text-platform-navy">{tCat(key)}</span>
                  <span className="text-xs font-medium text-slate-500">
                    {t("eventCount", { count: counts[key] })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section
      id="kategoriler"
      className="section-surface-white section-padding"
      aria-labelledby="categories-title"
    >
      <div className="section-container">
        {showHeader && (
          <SectionHeader
            title={t("title")}
            subtitle={t("subtitle")}
            titleId="categories-title"
            className="section-header-gap"
          />
        )}

        <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 min-[480px]:gap-4 lg:grid-cols-5 lg:gap-4">
          {categories.map((key) => (
            <li key={key}>
              <Link
                href={{ pathname: "/categories/[category]", params: { category: key } }}
                className={`category-card-home ${CATEGORY_PASTELS[key]}`}
              >
                <span className="category-card-home-icon" aria-hidden>
                  {CATEGORY_ICONS[key]}
                </span>
                <p className="category-card-home-name">{tCat(key)}</p>
                <p className="category-card-home-count">{t("eventCount", { count: counts[key] })}</p>
              </Link>
            </li>
          ))}
        </ul>

        {showHeader && (
          <p className="mt-8 text-center sm:mt-10">
            <Link
              href="/categories"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 transition hover:text-accent-600"
            >
              {t("viewAll")} →
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
