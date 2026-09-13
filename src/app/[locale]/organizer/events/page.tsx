import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { listOrganizerEvents } from "@/lib/organizer/data";

export default async function OrganizerEventsPage() {
  const t = await getTranslations("organizer");
  const events = await listOrganizerEvents();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("eventsTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t("eventsSubtitle")}</p>
        </div>
        <Link href="/organizer/events/new" className="btn-primary">
          {t("ctaNewEvent")}
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-slate-900">{t("eventsEmptyTitle")}</p>
          <p className="mt-2 text-sm text-slate-600">{t("eventsEmptyBody")}</p>
          <Link href="/organizer/events/new" className="btn-primary mt-6">
            {t("ctaNewEvent")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={{
                  pathname: "/organizer/events/[id]",
                  params: { id: event.id },
                }}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
              >
                <div>
                  <p className="font-semibold text-slate-900">{event.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(event.starts_at).toLocaleString()}
                    {event.venue_name ? ` · ${event.venue_name}` : ""}
                  </p>
                </div>
                <span
                  className={
                    event.status === "published"
                      ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                  }
                >
                  {event.status === "published"
                    ? t("statusPublished")
                    : t("statusDraft")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
