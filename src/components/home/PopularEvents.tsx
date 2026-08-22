import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { EventGrid } from "@/components/events/EventGrid";
import type { DiscoveryEvent } from "@/types/event";

interface PopularEventsProps {
  events: DiscoveryEvent[];
}

export function PopularEvents({ events }: PopularEventsProps) {
  const t = useTranslations("featuredSection");

  return (
    <section className="bg-slate-50 py-12 sm:py-16" aria-labelledby="featured-title">
      <div className="section-container">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="featured-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </div>
          <Link href="/events" className="text-sm font-semibold text-brand-700 hover:underline">
            {t("viewAll")} →
          </Link>
        </header>
        <EventGrid events={events} emptyNamespace="featuredSection" />
      </div>
    </section>
  );
}
