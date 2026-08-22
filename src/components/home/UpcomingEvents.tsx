import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { EventGrid } from "@/components/events/EventGrid";
import { CATEGORY_KEYS, DISTRICT_SLUGS } from "@/lib/data/categories";
import type { DiscoveryEvent } from "@/types/event";

interface UpcomingEventsProps {
  events: DiscoveryEvent[];
}

export function UpcomingEvents({ events }: UpcomingEventsProps) {
  const t = useTranslations("upcomingSection");
  const tCat = useTranslations("categories");
  const tDist = useTranslations("districts");

  return (
    <section id="yaklasan-etkinlikler" className="py-12 sm:py-16" aria-labelledby="upcoming-title">
      <div className="section-container">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="upcoming-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </div>
          <Link href="/events" className="text-sm font-semibold text-brand-700 hover:underline">
            {t("viewAll")} →
          </Link>
        </header>

        <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <Link
            href={{ pathname: "/events", query: { date: "week" } }}
            className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-brand-100 hover:text-brand-800"
          >
            {t("filterDate")}
          </Link>
          {DISTRICT_SLUGS.slice(0, 4).map((d) => (
            <Link
              key={d}
              href={{ pathname: "/events", query: { district: d } }}
              className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-brand-100 hover:text-brand-800"
            >
              {tDist(d)}
            </Link>
          ))}
          {CATEGORY_KEYS.slice(0, 3).map((c) => (
            <Link
              key={c}
              href={{ pathname: "/events", query: { category: c } }}
              className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-brand-100 hover:text-brand-800"
            >
              {tCat(c)}
            </Link>
          ))}
        </div>

        <EventGrid events={events} emptyNamespace="upcomingSection" />
      </div>
    </section>
  );
}
