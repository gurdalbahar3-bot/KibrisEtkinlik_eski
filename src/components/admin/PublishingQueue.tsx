import Link from "next/link";

import { PublishChecklist } from "@/components/admin/PublishChecklist";
import { PublishEventForm } from "@/components/admin/PublishEventForm";
import { PublishFeedback } from "@/components/admin/PublishFeedback";
import { formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import {
  buildDefaultEventPublishChecklist,
  isDefaultPublishableStatus,
} from "@/lib/admin/publish-event-result";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminEventListItem } from "@/lib/admin/data/admin-events-read";

interface PublishingQueueProps {
  events: AdminEventListItem[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  publishError?: string;
}

export function PublishingQueue({ events, locale, t, publishError }: PublishingQueueProps) {
  if (events.length === 0) {
    return (
      <div className="space-y-4">
        {publishError ? <PublishFeedback success={false} error={publishError} t={t} /> : null}
        <p className="text-sm text-slate-500">{t("noPublishingQueue")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {publishError ? <PublishFeedback success={false} error={publishError} t={t} /> : null}
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
        {t("realPublishingBadge")}
      </p>
      {events.map((event) => {
        const checklist = buildDefaultEventPublishChecklist(event);
        const canPublish = isDefaultPublishableStatus(event.status);

        return (
          <article
            key={event.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{event.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDistrictLabel(event.district, locale)} ·{" "}
                  {formatDateTime(event.startsAt, locale)}
                </p>
                <p className="mt-1 text-sm capitalize text-slate-700">{event.status}</p>
              </div>
              <Link
                href={`/admin/publishing/${event.id}`}
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                {t("publishPreview")}
              </Link>
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("colVenue")}</dt>
                <dd className="font-medium">{event.venueName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("adminEventsOwner")}</dt>
                <dd className="font-medium">{event.ownerLabel}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">{t("prePublishChecklist")}</h3>
              <div className="mt-2">
                <PublishChecklist items={checklist} t={t} />
              </div>
            </div>

            {canPublish ? (
              <div className="mt-4">
                <PublishEventForm
                  eventId={event.id}
                  returnPath="/admin/publishing"
                  t={t}
                />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
