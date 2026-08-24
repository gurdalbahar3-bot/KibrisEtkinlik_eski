import Link from "next/link";

import { PublishEventForm } from "@/components/admin/PublishEventForm";
import { PublishFeedback } from "@/components/admin/PublishFeedback";
import { getAdminEventHeaderBadgeKey } from "@/lib/admin/dashboard-view-model";
import { isDefaultPublishableStatus } from "@/lib/admin/publish-event-result";
import { getDataSource } from "@/lib/supabase/config";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminEventDetail } from "@/lib/admin/data/admin-events-read";

interface AdminEventDetailViewProps {
  event: AdminEventDetail;
  t: (key: keyof AdminMessages) => string;
  backHref?: string;
  backLabel?: string;
  showPublish?: boolean;
  publishReturnPath?: string;
  publishSuccess?: boolean;
  publishError?: string;
}

export function AdminEventDetailView({
  event,
  t,
  backHref = "/admin/events",
  backLabel,
  showPublish = false,
  publishReturnPath,
  publishSuccess = false,
  publishError,
}: AdminEventDetailViewProps) {
  const canPublish = showPublish && isDefaultPublishableStatus(event.status);
  const headerBadgeKey = getAdminEventHeaderBadgeKey(getDataSource(), canPublish);

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm font-medium text-brand-700 hover:underline">
        ← {backLabel ?? t("events")}
      </Link>

      {publishError || publishSuccess ? (
        <PublishFeedback success={publishSuccess} error={publishError} t={t} />
      ) : null}

      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          {t(headerBadgeKey)}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{event.title}</h1>
        {event.description ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{event.description}</p>
        ) : null}
      </header>

      <dl className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colStatus")}
          </dt>
          <dd className="mt-1 capitalize text-slate-900">{event.status}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colCategory")}
          </dt>
          <dd className="mt-1 capitalize text-slate-900">{event.category}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colDistrict")}
          </dt>
          <dd className="mt-1 capitalize text-slate-900">{event.district}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colVenue")}
          </dt>
          <dd className="mt-1 text-slate-900">{event.venueName}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colDate")}
          </dt>
          <dd className="mt-1 text-slate-900">{new Date(event.startsAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("adminEventsOwner")}
          </dt>
          <dd className="mt-1 text-slate-900">{event.ownerLabel}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            ID
          </dt>
          <dd className="mt-1 font-mono text-xs text-slate-700">{event.id}</dd>
        </div>
      </dl>

      {canPublish ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("publishEvent")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("publishingSubtitle")}</p>
          <div className="mt-4">
            <PublishEventForm
              eventId={event.id}
              returnPath={publishReturnPath ?? `/admin/events/${event.id}`}
              t={t}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
