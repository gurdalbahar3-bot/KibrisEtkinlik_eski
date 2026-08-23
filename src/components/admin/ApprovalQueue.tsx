import Image from "next/image";
import Link from "next/link";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import { LifecycleHistoryList } from "@/components/admin/LifecycleHistoryList";
import { PublishChecklist } from "@/components/admin/PublishChecklist";
import { approveIntakeFormAction, rejectIntakeFormAction } from "@/lib/admin/intake-actions";
import {
  buildPublishChecklist,
  getApprovedImageCandidate,
  intakeToSlug,
  canHumanApprove,
} from "@/lib/admin/publishing/publish-checklist";
import { buildAdminPublishPreview } from "@/lib/admin/publishing/intake-to-preview";
import { evaluateImageCandidate } from "@/types/admin/image-policy";
import { getEventContext } from "@/lib/admin/review/image-review-service";
import { formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { LifecycleTransition } from "@/types/admin/lifecycle-history";

interface ApprovalQueueProps {
  intakes: DiscoveredEventIntake[];
  historyByIntake: Record<string, LifecycleTransition[]>;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function ApprovalQueue({ intakes, historyByIntake, locale, t }: ApprovalQueueProps) {
  if (intakes.length === 0) {
    return <p className="text-sm text-slate-500">{t("noApprovalQueue")}</p>;
  }

  return (
    <div className="space-y-6">
      {intakes.map((intake) => {
        const approvedImage = getApprovedImageCandidate(intake);
        const imagePolicy = approvedImage
          ? evaluateImageCandidate(approvedImage, getEventContext(intake))
          : null;
        const preview = buildAdminPublishPreview(intake, locale);
        const checklist = buildPublishChecklist(intake);
        const canApprove = canHumanApprove(intake).ok;
        const history = historyByIntake[intake.id] ?? [];

        return (
          <article
            key={intake.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
              <div className="relative aspect-[4/3] bg-slate-100 lg:aspect-auto lg:min-h-[220px]">
                {approvedImage ? (
                  <Image
                    src={approvedImage.url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="240px"
                  />
                ) : (
                  <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-slate-500">
                    {t("noApprovedPoster")}
                  </div>
                )}
              </div>

              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{intake.rawTitle}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDistrictLabel(intake.suggestedDistrictId, locale)}
                      {intake.suggestedVenueId ? ` · ${intake.suggestedVenueId}` : ""}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDateTime(intake.suggestedStartsAt, locale)}
                      {intake.suggestedCategory ? ` · ${intake.suggestedCategory}` : ""}
                    </p>
                    <div className="mt-2">
                      <IntakeStatusBadge status={intake.status} t={t} />
                    </div>
                  </div>
                  <Link
                    href={`/admin/intake/${intake.id}`}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {t("reviewAction")}
                  </Link>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">{t("imageSourceLabel")}</dt>
                    <dd className="font-medium">{approvedImage?.source ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t("policyLabel")}</dt>
                    <dd className="font-medium">{imagePolicy?.verdict ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t("eventSlug")}</dt>
                    <dd className="font-mono text-xs">{intakeToSlug(intake.rawTitle)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t("officialTicketUrl")}</dt>
                    <dd className="break-all font-medium">
                      {intake.officialTicketUrl ?? t("noOfficialTicketUrl")}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("seoPreview")}</h3>
                  <p className="mt-1 text-sm font-medium text-brand-800">{preview.seoTitle}</p>
                  <p className="text-sm text-slate-600">{preview.seoDescription}</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("prePublishChecklist")}</h3>
                  <div className="mt-2">
                    <PublishChecklist items={checklist} t={t} />
                  </div>
                </div>

                {intake.aiReview ? (
                  <p className="text-xs text-amber-700">
                    {t("aiRecommendation")}: {intake.aiReview.recommendation} ({t("aiHintOnly")})
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                  <form action={approveIntakeFormAction}>
                    <input type="hidden" name="intakeId" value={intake.id} />
                    <button
                      type="submit"
                      disabled={!canApprove}
                      className="inline-flex min-h-10 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("approveIntake")}
                    </button>
                  </form>
                  <form
                    action={rejectIntakeFormAction}
                    className="flex flex-1 flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="intakeId" value={intake.id} />
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
                      {t("rejectIntake")}
                    </button>
                  </form>
                </div>

                {history.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t("lifecycleHistory")}</h3>
                    <div className="mt-2">
                      <LifecycleHistoryList history={history} locale={locale} t={t} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
