import Link from "next/link";

import {
  postponeAdminEventFormAction,
  publishAdminEventFormAction,
  rescheduleAdminEventFormAction,
} from "@/lib/admin/event-lifecycle-actions";
import {
  canPostponeEventStatus,
  canPublishEventStatus,
  canRescheduleEventStatus,
  messageForLifecycleError,
} from "@/lib/admin/data/admin-event-lifecycle";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminEventDetail } from "@/lib/admin/data/admin-events-read";

interface AdminEventDetailViewProps {
  event: AdminEventDetail;
  t: (key: keyof AdminMessages) => string;
  canWriteEvents: boolean;
  errorCode?: string;
  successCode?: string;
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminEventDetailView({
  event,
  t,
  canWriteEvents,
  errorCode,
  successCode,
}: AdminEventDetailViewProps) {
  const canPublish = canWriteEvents && canPublishEventStatus(event.status);
  const canPostpone = canWriteEvents && canPostponeEventStatus(event.status);
  const canReschedule = canWriteEvents && canRescheduleEventStatus(event.status);

  return (
    <div className="space-y-6">
      <Link href="/admin/events" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("events")}
      </Link>

      {errorCode ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {messageForLifecycleError(errorCode)}
        </p>
      ) : null}
      {successCode ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {successCode === "published"
            ? t("lifecyclePublishSuccess")
            : successCode === "postponed"
              ? t("lifecyclePostponeSuccess")
              : t("lifecycleRescheduleSuccess")}
        </p>
      ) : null}

      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          {t("adminEventsLifecycleBadge")}
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

      {!canWriteEvents ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("lifecycleRequiresSupabaseSession")}
        </p>
      ) : null}

      {(canPublish || canPostpone || canReschedule) && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("lifecycleActions")}</h2>

          {canPublish ? (
            <form action={publishAdminEventFormAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
              >
                {t("publishEvent")}
              </button>
            </form>
          ) : null}

          {canPostpone ? (
            <form action={postponeAdminEventFormAction} className="space-y-3">
              <input type="hidden" name="eventId" value={event.id} />
              <label className="block text-sm font-medium text-slate-700" htmlFor="postpone-reason">
                {t("postponeReason")}
              </label>
              <input
                id="postpone-reason"
                name="reason"
                type="text"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                {t("postponeEvent")}
              </button>
            </form>
          ) : null}

          {canReschedule ? (
            <form action={rescheduleAdminEventFormAction} className="space-y-3">
              <input type="hidden" name="eventId" value={event.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="starts-at">
                    {t("rescheduleStartsAt")}
                  </label>
                  <input
                    id="starts-at"
                    name="startsAt"
                    type="datetime-local"
                    required
                    defaultValue={toDateTimeLocal(event.startsAt)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="ends-at">
                    {t("rescheduleEndsAt")}
                  </label>
                  <input
                    id="ends-at"
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={toDateTimeLocal(event.endsAt)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900"
              >
                {t("rescheduleEvent")}
              </button>
            </form>
          ) : null}
        </section>
      )}
    </div>
  );
}
