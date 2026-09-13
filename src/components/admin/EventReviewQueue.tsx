import Link from "next/link";

import { formatDateTime } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminReviewEventListItem } from "@/lib/admin/data/admin-event-review";

interface EventReviewQueueProps {
  events: AdminReviewEventListItem[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  /** Detail link prefix, e.g. /admin/review/events or /tr/admin/events */
  basePath?: string;
}

export function EventReviewQueue({
  events,
  locale,
  t,
  basePath = "/admin/review/events",
}: EventReviewQueueProps) {
  if (events.length === 0) {
    return (
      <div className="space-y-3">
        <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          {t("eventReviewLiveBadge")}
        </p>
        <p className="text-sm text-slate-500">{t("noEventReviewQueue")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
        {t("eventReviewLiveBadge")}
      </p>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="truncate text-base font-semibold text-slate-900">{event.title}</p>
              <p className="text-sm text-slate-600">
                {event.venueName} · {formatDateTime(event.startsAt, locale)}
              </p>
              <p className="text-sm text-slate-600">
                {t("adminEventsOwner")}: {event.ownerLabel}
              </p>
              <p className="text-xs text-slate-500">
                {t("colCreated")}:{" "}
                {event.createdAt ? formatDateTime(event.createdAt, locale) : "—"}
                {event.reviewSubmittedAt
                  ? ` · ${t("colSubmitted")}: ${formatDateTime(event.reviewSubmittedAt, locale)}`
                  : null}
              </p>
              <p className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold capitalize text-amber-900">
                {event.status}
              </p>
            </div>
            <Link
              href={`${basePath}/${event.id}`}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              {t("reviewAction")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
