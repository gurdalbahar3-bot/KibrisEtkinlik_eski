import Link from "next/link";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import {
  rejectFromAiReviewFormAction,
  sendToImageReviewFormAction,
} from "@/lib/admin/intake-actions";
import { formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

interface AiReviewQueueProps {
  intakes: DiscoveredEventIntake[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function AiReviewQueue({ intakes, locale, t }: AiReviewQueueProps) {
  if (intakes.length === 0) {
    return <p className="text-sm text-slate-500">{t("noAiReviewQueue")}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-700">{t("aiHintOnly")}</p>
      {intakes.map((intake) => (
        <article
          key={intake.id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{intake.rawTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {intake.source} · {formatDistrictLabel(intake.suggestedDistrictId, locale)}
                  {intake.suggestedVenueId ? ` · ${intake.suggestedVenueId}` : ""}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(intake.suggestedStartsAt, locale)}
                </p>
              </div>
              <IntakeStatusBadge status={intake.status} t={t} />
            </div>
          </div>

          <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">{t("sourceUrl")}</dt>
                <dd className="break-all font-medium text-slate-900">
                  {intake.sourceUrl ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("aiConfidence")}</dt>
                <dd className="font-medium">
                  {intake.aiReview
                    ? `${Math.round(intake.aiReview.confidence * 100)}% (${t("aiHintOnly")})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("aiDuplicateOf")}</dt>
                <dd className="font-medium">{intake.duplicateOf ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("fieldCategory")}</dt>
                <dd className="font-medium">
                  {intake.aiReview?.categorySuggestion ?? intake.suggestedCategory ?? "—"}
                </dd>
              </div>
            </dl>

            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">{t("aiDistrictMatch")}</dt>
                <dd className="font-medium">
                  {intake.aiReview
                    ? intake.aiReview.districtMatch
                      ? t("yes")
                      : t("no")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("aiVenueMatch")}</dt>
                <dd className="font-medium">
                  {intake.aiReview
                    ? intake.aiReview.venueMatch
                      ? t("yes")
                      : t("no")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("aiFlags")}</dt>
                <dd className="font-medium">
                  {intake.aiReview?.flags.length ? intake.aiReview.flags.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("aiRecommendation")}</dt>
                <dd className="font-semibold text-brand-800">
                  {intake.aiReview?.recommendation ?? "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
            <form action={sendToImageReviewFormAction}>
              <input type="hidden" name="intakeId" value={intake.id} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
              >
                {t("sendToImageReview")}
              </button>
            </form>
            <form action={rejectFromAiReviewFormAction} className="flex flex-1 flex-wrap items-center gap-2">
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
                {t("rejectFromAiReview")}
              </button>
            </form>
            <Link
              href={`/admin/intake/${intake.id}`}
              className="text-sm font-semibold text-brand-700 hover:underline"
            >
              {t("reviewAction")}
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
