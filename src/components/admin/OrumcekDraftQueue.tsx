import Link from "next/link";

import { OrumcekStatusBadge } from "@/components/admin/OrumcekStatusBadge";
import {
  approveOrumcekDraftAction,
  rejectOrumcekDraftAction,
  sendOrumcekDraftToReviewAction,
} from "@/lib/orumcek/admin-actions";
import { formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import { getSourceSeedById } from "@/lib/orumcek/sources";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { IntakeDraft } from "@/lib/orumcek/types";

interface OrumcekDraftQueueProps {
  drafts: IntakeDraft[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function OrumcekDraftQueue({ drafts, locale, t }: OrumcekDraftQueueProps) {
  if (drafts.length === 0) {
    return <p className="text-sm text-slate-500">{t("orumcekQueueEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {drafts.map((draft) => {
        const source = draft.sourceSeedId ? getSourceSeedById(draft.sourceSeedId) : undefined;
        const canApprove = draft.status === "PENDING_APPROVAL" || draft.status === "REVIEW";
        const canSendToReview = draft.status === "PENDING_APPROVAL";

        return (
          <article
            key={draft.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {draft.draft.title ?? t("orumcekUntitled")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {source?.name ?? draft.sourceUrl} ·{" "}
                    {draft.draft.districtId
                      ? formatDistrictLabel(draft.draft.districtId, locale)
                      : draft.identity.district}
                    {draft.draft.venueName ? ` · ${draft.draft.venueName}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("orumcekProvenance")}:{" "}
                    {draft.provenance === "LIVE_CRAWL"
                      ? t("orumcekProvenanceLiveCrawl")
                      : t("orumcekProvenanceFixture")}
                    {source ? ` · ${source.id}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDateTime(draft.draft.startsAt, locale)}
                  </p>
                </div>
                <OrumcekStatusBadge status={draft.status} t={t} />
              </div>
            </div>

            <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">{t("sourceUrl")}</dt>
                  <dd className="break-all font-medium text-slate-900">{draft.sourceUrl}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("orumcekConfidence")}</dt>
                  <dd className="font-medium">
                    {Math.round(draft.confidence.score * 100)}%
                    {draft.confidence.unsure ? ` · ${t("orumcekNeedsReview")}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("fieldCategory")}</dt>
                  <dd className="font-medium">{draft.draft.category ?? "—"}</dd>
                </div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">{t("fingerprint")}</dt>
                  <dd className="break-all font-medium text-slate-900">{draft.identity.identityKey}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("orumcekObservations")}</dt>
                  <dd className="font-medium">{draft.observationIds.length}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("orumcekNoAutoPublish")}</dt>
                  <dd className="font-medium">{t("orumcekReadyForSaOnly")}</dd>
                </div>
              </dl>
            </div>

            {draft.confidence.reasons.length > 0 ? (
              <ul className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm text-amber-900">
                {draft.confidence.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
              {canApprove ? (
                <form action={approveOrumcekDraftAction}>
                  <input type="hidden" name="draftId" value={draft.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
                  >
                    {t("orumcekApproveReady")}
                  </button>
                </form>
              ) : null}
              {canSendToReview ? (
                <form action={sendOrumcekDraftToReviewAction}>
                  <input type="hidden" name="draftId" value={draft.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t("orumcekSendToReview")}
                  </button>
                </form>
              ) : null}
              {canApprove ? (
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
              ) : null}
              <Link
                href={`/admin/review/ai/${draft.id}`}
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                {t("reviewAction")}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
