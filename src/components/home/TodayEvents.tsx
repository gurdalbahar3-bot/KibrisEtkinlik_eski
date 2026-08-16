import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { EventGrid } from "@/components/events/EventGrid";
import type { DiscoveryEvent } from "@/types/event";

interface TodayEventsProps {
  events: DiscoveryEvent[];
}

export function TodayEvents({ events }: TodayEventsProps) {
  const t = useTranslations("todaySection");

  return (
    <section
      id="bugun-kibrista"
      className="border-t-4 border-accent-500 py-10 sm:py-14"
      aria-labelledby="today-title"
    >
      <div className="section-container">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-accent-600">
              {t("badge")}
            </p>
            <h2 id="today-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </div>
          <Link
            href={{ pathname: "/events", query: { date: "today" } }}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("viewAll")} →
          </Link>
        </header>
        <EventGrid events={events} priorityFirst={4} />
      </div>
    </section>
  );
}
