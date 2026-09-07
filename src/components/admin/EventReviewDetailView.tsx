import Link from "next/link";

import { ApproveEventForm } from "@/components/admin/ApproveEventForm";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminReviewEventDetail } from "@/lib/admin/data/admin-event-review";

interface EventReviewDetailViewProps {
  event: AdminReviewEventDetail;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  approveSuccess?: boolean;
  approveError?: string;
}

export function EventReviewDetailView({
  event,
  locale,
  t,
  approveSuccess = false,
  approveError,
}: EventReviewDetailViewProps) {
  const canApprove = event.status === "in_review";
  const isApproved = event.status === "approved" || approveSuccess;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/review/events"
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        ← {t("eventReview")}
      </Link>

      {approveError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {approveError}
        </p>
      ) : null}

      {approveSuccess || isApproved ? (
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

      {canApprove ? (
        <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-5">
          <p className="text-sm text-brand-950">{t("approveHint")}</p>
          <div className="mt-3">
            <ApproveEventForm eventId={event.id} t={t} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
