import { getTranslations } from "next-intl/server";
import { CATEGORY_KEYS, DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";

interface DiscoveryFilterFormProps {
  locale: string;
  filters: DiscoverySearchParams;
}

export async function DiscoveryFilterForm({ locale, filters }: DiscoveryFilterFormProps) {
  const t = await getTranslations({ locale, namespace: "listing" });
  const tCat = await getTranslations({ locale, namespace: "categories" });
  const tDist = await getTranslations({ locale, namespace: "districts" });

  const basePath = locale === "tr" ? "/tr/etkinlikler" : "/en/events";

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="filter-q" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("searchLabel")}
        </label>
        <input
          id="filter-q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="filter-date" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("dateLabel")}
        </label>
        <select
          id="filter-date"
          name="date"
          defaultValue={filters.date ?? ""}
          className="w-full min-w-[140px] rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
        >
          <option value="">{t("all")}</option>
          <option value="today">{t("dateToday")}</option>
          <option value="tomorrow">{t("dateTomorrow")}</option>
          <option value="weekend">{t("dateWeekend")}</option>
          <option value="week">{t("dateWeek")}</option>
          <option value="month">{t("dateMonth")}</option>
        </select>
      </div>

      <div>
        <label htmlFor="filter-district" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("districtLabel")}
        </label>
        <select
          id="filter-district"
          name="district"
          defaultValue={filters.district ?? ""}
          className="w-full min-w-[140px] rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
        >
          <option value="">{t("all")}</option>
          {DISTRICT_SLUGS.map((d) => (
            <option key={d} value={d}>
              {tDist(d)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-category" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("categoryLabel")}
        </label>
        <select
          id="filter-category"
          name="category"
          defaultValue={filters.category ?? ""}
          className="w-full min-w-[140px] rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
        >
          <option value="">{t("all")}</option>
          {CATEGORY_KEYS.map((c) => (
            <option key={c} value={c}>
              {tCat(c)}
            </option>
          ))}
        </select>
      </div>

      {/* Preserve hero/listing params that this form does not edit. */}
      {filters.scope && filters.scope !== "event" ? (
        <input type="hidden" name="scope" value={filters.scope} />
      ) : null}
      {filters.from ? <input type="hidden" name="from" value={filters.from} /> : null}
      {filters.to ? <input type="hidden" name="to" value={filters.to} /> : null}

      <button
        type="submit"
        className="min-h-[42px] rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        {t("applyFilters")}
      </button>
    </form>
  );
}
