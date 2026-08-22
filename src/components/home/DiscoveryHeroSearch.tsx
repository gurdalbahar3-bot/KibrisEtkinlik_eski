"use client";

import { FormEvent, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import type { DiscoverySearchScope } from "@/lib/discovery/search-params";

type DateChip = "today" | "tomorrow" | "weekend";

export function DiscoveryHeroSearch() {
  const t = useTranslations("hero");
  const router = useRouter();
  const datePickerId = useId();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<DiscoverySearchScope>("event");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      if (scope === "venue") {
        router.push("/venues");
      } else {
        router.push("/events");
      }
      return;
    }

    if (scope === "venue") {
      router.push({ pathname: "/venues", query: { q } });
      return;
    }

    router.push({
      pathname: "/events",
      query: {
        q,
        ...(scope === "artist" ? { scope: "artist" } : {}),
      },
    });
  }

  function goDate(date: DateChip) {
    router.push({ pathname: "/events", query: { date } });
  }

  function onPickDate(value: string) {
    if (!value) return;
    router.push({ pathname: "/events", query: { from: value, to: value } });
  }

  const scopes: { id: DiscoverySearchScope; label: string }[] = [
    { id: "event", label: t("scopeEvent") },
    { id: "artist", label: t("scopeArtist") },
    { id: "venue", label: t("scopeVenue") },
  ];

  return (
    <div className="hero-search-panel mt-6 sm:mt-8">
      <div
        className="mb-3 flex flex-wrap gap-1.5 rounded-xl bg-slate-100/90 p-1"
        role="radiogroup"
        aria-label={t("scopeLabel")}
      >
        {scopes.map(({ id, label }) => {
          const active = scope === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setScope(id)}
              className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold transition sm:min-h-11 sm:text-sm ${
                active
                  ? "bg-white text-platform-navy shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:text-platform-navy"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        onSubmit={onSubmit}
      >
        <label htmlFor="discovery-hero-search" className="sr-only">
          {t("searchPlaceholder")}
        </label>
        <input
          id="discovery-hero-search"
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-400/30 sm:min-h-12"
          autoComplete="off"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-xl bg-accent-500 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400/40 sm:min-h-12"
        >
          {t("searchButton")}
        </button>
      </form>

      <div
        className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-0.5 scrollbar-hide sm:flex-wrap sm:overflow-visible"
        role="group"
        aria-label={t("quickDatesLabel")}
      >
        {(
          [
            ["today", t("filterToday")],
            ["tomorrow", t("filterTomorrow")],
            ["weekend", t("filterWeekend")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => goDate(key)}
            className="shrink-0 snap-start rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700"
          >
            {label}
          </button>
        ))}

        <label className="relative shrink-0 snap-start cursor-pointer rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700">
          {t("filterDate")}
          <input
            id={datePickerId}
            type="date"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => onPickDate(e.target.value)}
            aria-label={t("filterDate")}
          />
        </label>
      </div>
    </div>
  );
}
