import Link from "next/link";

import { ApproveAndPublishEventForm } from "@/components/admin/ApproveAndPublishEventForm";
import { ApproveEventForm } from "@/components/admin/ApproveEventForm";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminReviewEventDetailWithTickets } from "@/lib/admin/data/admin-event-review";

interface EventReviewDetailViewProps {
  event: AdminReviewEventDetailWithTickets;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  approveSuccess?: boolean;
  approveError?: string;
  publishSuccess?: boolean;
  approvePublishError?: string;
  publicPath?: string | null;
  basePath?: string;
}

export function EventReviewDetailView({
  event,
  locale,
  t,
  approveSuccess = false,
  approveError,
  publishSuccess = false,
  approvePublishError,
  publicPath = null,
  basePath = "/admin/review/events",
}: EventReviewDetailViewProps) {
  const canApprove = event.status === "in_review";
  const isApproved = event.status === "approved" || approveSuccess;

  return (
    <div className="space-y-6">
      <Link href={basePath} className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("eventReview")}
      </Link>

      {/* If already published, ignore stale double-submit approvePublishError query params. */}
      {approveError && !publishSuccess ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {approveError}
        </p>
      ) : null}

      {approvePublishError && !publishSuccess ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {t("approveAndPublishError")}: {approvePublishError}
        </p>
      ) : null}

      {publishSuccess ? (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
          <p className="text-sm font-semibold text-emerald-900">{t("approveAndPublishSuccess")}</p>
          {publicPath ? (
            <p className="text-sm text-emerald-900">
              {t("publishSuccessPublicLink")}:{" "}
              <Link href={publicPath} className="font-semibold underline">
                {publicPath}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Approve-only success — never alongside published success. */}
      {(approveSuccess || isApproved) && !publishSuccess && event.status !== "published" ? (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
          <p className="text-sm font-semibold text-emerald-900">{t("approveEventSuccess")}</p>
          <p className="text-sm text-emerald-900">{t("approveThenPublishHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/publishing/${event.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              {t("goToPublish")}
            </Link>
            <Link
              href="/admin/publishing"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 hover:bg-brand-50"
            >
              {t("publishing")}
            </Link>
          </div>
        </div>
      ) : null}

      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          {t("eventReviewLiveBadge")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{event.title}</h1>
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-800">
            {event.status}
          </span>
        </div>
        {event.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {event.description}
          </p>
        ) : null}
      </header>

      {event.coverImageUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.coverImageUrl}
            alt={event.title}
            className="max-h-80 w-full object-cover"
          />
        </div>
      ) : null}

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
            {t("colVenue")}
          </dt>
          <dd className="mt-1 text-slate-900">{event.venueName}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colDate")}
          </dt>
          <dd className="mt-1 text-slate-900">{formatDateTime(event.startsAt, locale)}</dd>
        </div>
        {event.endsAt ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("colEndsAt")}
            </dt>
            <dd className="mt-1 text-slate-900">{formatDateTime(event.endsAt, locale)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colPricing")}
          </dt>
          <dd className="mt-1 text-slate-900">
            {event.isFree ? t("pricingFree") : t("pricingPaid")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colWedding")}
          </dt>
          <dd className="mt-1 text-slate-900">{event.isWedding ? t("yes") : t("no")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("adminEventsOwner")}
          </dt>
          <dd className="mt-1 text-slate-900">{event.ownerLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colCreated")}
          </dt>
          <dd className="mt-1 text-slate-900">
            {event.createdAt ? formatDateTime(event.createdAt, locale) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("colSubmitted")}
          </dt>
          <dd className="mt-1 text-slate-900">
            {event.reviewSubmittedAt
              ? formatDateTime(event.reviewSubmittedAt, locale)
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">ID</dt>
          <dd className="mt-1 font-mono text-xs text-slate-700">{event.id}</dd>
        </div>
      </dl>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("ticketZonesHeading")}</h2>
        {event.ticketZones.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t("ticketZonesEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {event.ticketZones.map((zone) => (
              <li key={zone.id} className="rounded-lg border border-slate-100 p-4">
                <p className="font-semibold text-slate-900">
                  {zone.name}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    ({t("ticketZoneCapacity")}: {zone.capacity})
                  </span>
                </p>
                {zone.types.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">{t("ticketTypesEmpty")}</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {zone.types.map((ticketType) => (
                      <li key={ticketType.id} className="flex flex-wrap gap-2">
                        <span className="font-medium">{ticketType.name}</span>
                        <span>
                          {ticketType.price.toLocaleString(locale === "en" ? "en-GB" : "tr-TR")}{" "}
                          TRY
                        </span>
                        {!ticketType.isActive ? (
                          <span className="text-xs text-slate-500">({t("ticketTypeInactive")})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canApprove ? (
        <div className="space-y-4 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-5">
          <p className="text-sm text-brand-950">{t("approveAndPublishHint")}</p>
          <div className="flex flex-wrap gap-3">
            <ApproveAndPublishEventForm
              eventId={event.id}
              locale={locale}
              t={t}
              returnBase={basePath}
            />
            <ApproveEventForm eventId={event.id} t={t} returnBase={basePath} />
            <button
              type="button"
              disabled
              title={t("rejectEventUnavailable")}
              className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-500"
            >
              {t("rejectEvent")}
            </button>
          </div>
          <p className="text-xs text-slate-600">{t("rejectEventUnavailable")}</p>
        </div>
      ) : null}
    </div>
  );
}
