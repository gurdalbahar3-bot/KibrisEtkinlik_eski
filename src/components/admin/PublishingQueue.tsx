import Image from "next/image";
import Link from "next/link";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import { PublishChecklist } from "@/components/admin/PublishChecklist";
import { publishIntakeFormAction } from "@/lib/admin/intake-actions";
import { mockPublishingAdapter } from "@/lib/admin/adapters/mock/mock-publishing";
import { formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

interface PublishingQueueProps {
  intakes: DiscoveredEventIntake[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function PublishingQueue({ intakes, locale, t }: PublishingQueueProps) {
  if (intakes.length === 0) {
    return <p className="text-sm text-slate-500">{t("noPublishingQueue")}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        {t("mockPublishingBadge")}
      </p>
      {intakes.map((intake) => {
        const validation = mockPublishingAdapter.validatePublish(intake);
        const preview = mockPublishingAdapter.getPublishPreview(intake, locale);

        return (
          <article
            key={intake.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap gap-4">
              {preview.posterUrl ? (
                <div className="relative h-28 w-40 overflow-hidden rounded-lg bg-slate-100">
                  <Image src={preview.posterUrl} alt="" fill className="object-cover" sizes="160px" />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{intake.rawTitle}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDistrictLabel(intake.suggestedDistrictId, locale)} ·{" "}
                      {formatDateTime(intake.suggestedStartsAt, locale)}
                    </p>
                    <div className="mt-2">
                      <IntakeStatusBadge status={intake.status} t={t} />
                    </div>
                  </div>
                  <Link
                    href={`/admin/publishing/${intake.id}`}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {t("publishPreview")}
                  </Link>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">{t("approvedBy")}</dt>
                    <dd className="font-medium">{intake.approvedBy ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t("approvedAt")}</dt>
                    <dd className="font-medium">
                      {intake.approvedAt ? formatDateTime(intake.approvedAt, locale) : "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-slate-900">{t("prePublishChecklist")}</h3>
                  <div className="mt-2">
                    <PublishChecklist items={validation.checklist} t={t} />
                  </div>
                </div>

                <form action={publishIntakeFormAction} className="mt-4">
                  <input type="hidden" name="intakeId" value={intake.id} />
                  <button
                    type="submit"
                    disabled={!validation.ok}
                    className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("publishEvent")}
                  </button>
                </form>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
