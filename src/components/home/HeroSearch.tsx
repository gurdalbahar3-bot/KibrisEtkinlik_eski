"use client";

import { FormEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { CATEGORY_KEYS, DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DiscoverySearchParams } from "@/lib/discovery/search-params";

interface HeroSearchProps {
  initialQuery?: string;
}

export function HeroSearch({ initialQuery = "" }: HeroSearchProps) {
  const t = useTranslations("hero");
  const tCat = useTranslations("categories");
  const tDist = useTranslations("districts");
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const dateInputRef = useRef<HTMLInputElement>(null);

  function navigate(params: DiscoverySearchParams) {
    router.push({
      pathname: "/events",
      query: {
        ...(params.q ? { q: params.q } : {}),
        ...(params.date ? { date: params.date } : {}),
        ...(params.district ? { district: params.district } : {}),
        ...(params.category ? { category: params.category } : {}),
      },
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    navigate({ q: query.trim() || undefined });
  }

  const quickDates: { key: "filterToday" | "filterTomorrow" | "filterWeekend"; date: DiscoverySearchParams["date"] }[] = [
    { key: "filterToday", date: "today" },
    { key: "filterTomorrow", date: "tomorrow" },
    { key: "filterWeekend", date: "weekend" },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-accent-500 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-brand-400 blur-3xl" />
      </div>

      <div className="section-container relative py-10 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-base text-brand-100 sm:mt-4 sm:text-xl">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-6 max-w-3xl sm:mt-10">
          <form
            role="search"
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={onSubmit}
          >
            <label htmlFor="hero-search" className="sr-only">
              {t("searchPlaceholder")}
            </label>
            <input
              id="hero-search"
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="min-h-[3rem] flex-1 rounded-2xl border-0 bg-white px-4 text-base text-slate-900 shadow-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-400 sm:min-h-[3.5rem] sm:px-5"
              autoComplete="off"
            />
            <button
              type="submit"
              className="min-h-[3rem] rounded-2xl bg-accent-500 px-6 text-base font-semibold text-white shadow-xl transition hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-300 sm:min-h-[3.5rem] sm:px-8"
            >
              {t("searchButton")}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {quickDates.map(({ key, date }) => (
              <button
                key={key}
                type="button"
                onClick={() => navigate({ date: date! })}
                className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:border-accent-400 hover:bg-accent-500/90"
              >
                {t(key)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:border-accent-400 hover:bg-accent-500/90"
            >
              {t("filterDate")}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.value) {
                  router.push({ pathname: "/events", query: { date: "today" } });
                }
              }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:justify-center sm:gap-3">
            <label className="sr-only" htmlFor="hero-district">
              {t("filterDistrict")}
            </label>
            <select
              id="hero-district"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) navigate({ district: v as DiscoverySearchParams["district"] });
              }}
              className="min-h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white backdrop-blur focus:outline-none focus:ring-2 focus:ring-accent-400 sm:min-h-11 sm:px-4 [&>option]:text-slate-900"
            >
              <option value="">{t("filterDistrict")}</option>
              {DISTRICT_SLUGS.map((d) => (
                <option key={d} value={d}>
                  {tDist(d)}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="hero-category">
              {t("filterCategory")}
            </label>
            <select
              id="hero-category"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) navigate({ category: v as DiscoverySearchParams["category"] });
              }}
              className="min-h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white backdrop-blur focus:outline-none focus:ring-2 focus:ring-accent-400 sm:min-h-11 sm:px-4 [&>option]:text-slate-900"
            >
              <option value="">{t("filterCategory")}</option>
              {CATEGORY_KEYS.map((c) => (
                <option key={c} value={c}>
                  {tCat(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

export function QuickFilters() {
  const t = useTranslations("quickDiscover");
  const router = useRouter();

  const items: { key: string; date: DiscoverySearchParams["date"] }[] = [
    { key: "today", date: "today" },
    { key: "tomorrow", date: "tomorrow" },
    { key: "weekend", date: "weekend" },
    { key: "thisWeek", date: "week" },
    { key: "thisMonth", date: "month" },
  ];

  return (
    <section
      className="sticky top-16 z-40 border-b border-slate-200 bg-white/95 py-3 backdrop-blur-md sm:py-4"
      aria-labelledby="quick-discover-title"
    >
      <div className="section-container">
        <h2 id="quick-discover-title" className="sr-only">
          {t("title")}
        </h2>
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
          {items.map(({ key, date }) => (
            <button
              key={key}
              type="button"
              onClick={() => router.push({ pathname: "/events", query: { date: date! } })}
              className="shrink-0 snap-start rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-brand-600 hover:text-white sm:px-5 sm:py-2.5"
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
