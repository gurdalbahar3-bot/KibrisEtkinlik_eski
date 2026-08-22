import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { EventGrid } from "@/components/events/EventGrid";
import type { DiscoveryEvent } from "@/types/event";

interface WeekendEventsProps {
  events: DiscoveryEvent[];
}

export function WeekendEvents({ events }: WeekendEventsProps) {
  const t = useTranslations("weekendSection");

  return (
    <section
      id="bu-hafta-sonu"
      className="bg-white py-12 sm:py-16"
      aria-labelledby="weekend-title"
    >
      <div className="section-container">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
          <div>
            <h2 id="weekend-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </div>
          <Link
            href={{ pathname: "/events", query: { date: "weekend" } }}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("viewAll")} →
          </Link>
        </header>
        <EventGrid events={events} emptyNamespace="weekendSection" />
      </div>
    </section>
  );
}
