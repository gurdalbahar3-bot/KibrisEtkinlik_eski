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
    <div className="mt-6 w-full max-w-xl sm:mt-7">
      <div
        className="mb-3 flex flex-wrap gap-2"
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
              className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition sm:text-sm ${
                active
                  ? "bg-accent-500 text-white shadow-sm"
                  : "border border-white/20 bg-white/10 text-white/90 hover:bg-white/15"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
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
          className="min-h-11 flex-1 rounded-xl border-0 bg-white px-4 text-base text-slate-900 shadow-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-400 sm:min-h-12"
          autoComplete="off"
        />
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-accent-500 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-300 sm:min-h-12 sm:px-6"
        >
          {t("searchButton")}
        </button>
      </form>

      <div className="mt-4 -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:overflow-visible">
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
            className="shrink-0 snap-start rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-accent-300/80 hover:bg-accent-500/90"
          >
            {label}
          </button>
        ))}

        <label className="relative shrink-0 snap-start cursor-pointer rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-accent-300/80 hover:bg-accent-500/90">
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
