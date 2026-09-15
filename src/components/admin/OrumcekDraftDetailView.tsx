import Link from "next/link";

import { OrumcekStatusBadge } from "@/components/admin/OrumcekStatusBadge";
import {
  approveOrumcekDraftAction,
  rejectOrumcekDraftAction,
} from "@/lib/orumcek/admin-actions";
import { formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import { getSourceSeedById } from "@/lib/orumcek/sources";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { IntakeDraft, SpiderObservation } from "@/lib/orumcek/types";

interface OrumcekDraftDetailViewProps {
  draft: IntakeDraft;
  observations: SpiderObservation[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function OrumcekDraftDetailView({
  draft,
  observations,
  locale,
  t,
}: OrumcekDraftDetailViewProps) {
  const source = draft.sourceSeedId ? getSourceSeedById(draft.sourceSeedId) : undefined;
  const canApprove = draft.status === "PENDING_APPROVAL" || draft.status === "REVIEW";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">
            <Link href="/admin/review/ai" className="hover:underline">
              {t("orumcekTitle")}
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {draft.draft.title ?? t("orumcekUntitled")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {source?.name ?? draft.sourceUrl} ·{" "}
            {draft.draft.districtId
              ? formatDistrictLabel(draft.draft.districtId, locale)
              : draft.identity.district}
          </p>
        </div>
        <OrumcekStatusBadge status={draft.status} t={t} />
      </header>

      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {t("orumcekNoAutoPublishBanner")}
      </p>

      {draft.status === "APPROVED_READY" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">{t("orumcekApprovedReadyTitle")}</p>
          <p className="mt-1">{t("orumcekApprovedReadyBody")}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/admin/review/events" className="font-semibold underline">
              {t("eventReview")}
            </Link>
            <Link href="/admin/publishing" className="font-semibold underline">
              {t("publishing")}
            </Link>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-2">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">{t("colTitle")}</dt>
            <dd className="font-medium text-slate-900">{draft.draft.title ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colDescription")}</dt>
            <dd className="font-medium text-slate-900">{draft.draft.description ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fieldCategory")}</dt>
            <dd className="font-medium text-slate-900">{draft.draft.category ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colDistrict")}</dt>
            <dd className="font-medium text-slate-900">
              {draft.draft.districtId
                ? formatDistrictLabel(draft.draft.districtId, locale)
                : "—"}
            </dd>
          </div>
        </dl>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">{t("colVenue")}</dt>
            <dd className="font-medium text-slate-900">{draft.draft.venueName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colDate")}</dt>
            <dd className="font-medium text-slate-900">
              {formatDateTime(draft.draft.startsAt, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fieldArtist")}</dt>
            <dd className="font-medium text-slate-900">{draft.draft.artist ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("officialTicketUrl")}</dt>
            <dd className="break-all font-medium text-slate-900">
              {draft.draft.officialTicketUrl ?? t("noOfficialTicketUrl")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t("orumcekConfidence")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {Math.round(draft.confidence.score * 100)}%
          {draft.confidence.unsure ? ` · ${t("orumcekNeedsReview")}` : ""}
        </p>
        {draft.draft.unsureFields.length > 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {t("orumcekUnsureFields")}: {draft.draft.unsureFields.join(", ")}
          </p>
        ) : null}
        {draft.confidence.reasons.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-amber-900">
            {draft.confidence.reasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t("orumcekObservations")}</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {observations.map((observation) => (
            <li key={observation.id} className="py-3 text-sm">
              <p className="font-medium text-slate-900">{observation.raw.rawTitle}</p>
              <p className="break-all text-slate-600">{observation.sourceUrl}</p>
              <p className="text-slate-500">
                {formatDateTime(observation.capturedAt, locale)} · {observation.raw.rawDistrict} ·{" "}
                {observation.raw.rawVenue ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {canApprove ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <form action={approveOrumcekDraftAction}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              {t("orumcekApproveReady")}
            </button>
          </form>
          <form action={rejectOrumcekDraftAction} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="draftId" value={draft.id} />
            <input
              name="reason"
              required
              placeholder={t("rejectReasonPlaceholder")}
              className="min-h-10 min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
            >
              {t("orumcekReject")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
