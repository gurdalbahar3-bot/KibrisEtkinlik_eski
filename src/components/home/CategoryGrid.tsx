import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { CATEGORY_KEYS, CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/data/categories";

interface CategoryGridProps {
  showHeader?: boolean;
}

export function CategoryGrid({ showHeader = true }: CategoryGridProps) {
  const t = useTranslations("categoriesSection");
  const tCat = useTranslations("categories");

  return (
    <section
      id="kategoriler"
      className={showHeader ? "py-12 sm:py-16" : ""}
      aria-labelledby={showHeader ? "categories-title" : undefined}
    >
      <div className={showHeader ? "section-container" : ""}>
        {showHeader && (
          <header className="mb-8">
            <h2 id="categories-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </header>
        )}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
          {CATEGORY_KEYS.map((key) => (
            <li key={key}>
              <Link
                href={{ pathname: "/categories/[category]", params: { category: key } }}
                className={`group flex min-h-[128px] flex-col justify-between rounded-2xl bg-gradient-to-br ${CATEGORY_COLORS[key]} p-4 text-white shadow-card ring-1 ring-white/20 transition hover:-translate-y-1 hover:shadow-card-hover sm:min-h-[140px] sm:p-5`}
              >
                <span className="text-3xl transition group-hover:scale-110" aria-hidden>
                  {CATEGORY_ICONS[key]}
                </span>
                <span className="text-sm font-semibold leading-tight sm:text-base">{tCat(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
