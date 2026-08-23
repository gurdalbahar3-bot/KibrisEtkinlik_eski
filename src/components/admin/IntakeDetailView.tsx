import Link from "next/link";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import { ImageCandidateCard } from "@/components/admin/ImageCandidateCard";
import { LifecycleHistoryList } from "@/components/admin/LifecycleHistoryList";
import { sendToAiReviewFormAction } from "@/lib/admin/intake-actions";
import { buildNormalizedIntakeView } from "@/lib/admin/intake/normalized-view";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { LifecycleTransition } from "@/types/admin/lifecycle-history";

interface IntakeDetailViewProps {
  intake: DiscoveredEventIntake;
  history: LifecycleTransition[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function IntakeDetailView({ intake, history, locale, t }: IntakeDetailViewProps) {
  const canSendToAiReview = intake.status === "DISCOVERED";
  const normalized = buildNormalizedIntakeView(intake, locale);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/intake" className="text-sm font-medium text-brand-700 hover:underline">
            ← {t("intake")}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{intake.rawTitle}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <IntakeStatusBadge status={intake.status} t={t} />
            {intake.duplicateOf ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {t("duplicateOf")}: {intake.duplicateOf}
              </span>
            ) : null}
          </div>
        </div>
        {canSendToAiReview ? (
          <form action={sendToAiReviewFormAction}>
            <input type="hidden" name="id" value={intake.id} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              {t("sendToAiReview")}
            </button>
          </form>
        ) : null}
      </header>

      <DetailSection title={t("rawDataSection")}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t("colTitle")}</dt>
            <dd className="mt-1 font-medium text-slate-900">{intake.rawTitle}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">{t("colDescription")}</dt>
            <dd className="mt-1 text-slate-900">{intake.rawDescription ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colDistrict")}</dt>
            <dd className="mt-1 text-slate-900">{intake.suggestedDistrictId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colVenue")}</dt>
            <dd className="mt-1 text-slate-900">{intake.suggestedVenueId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colDate")}</dt>
            <dd className="mt-1 text-slate-900">
              {formatDateTime(intake.suggestedStartsAt, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fieldCategory")}</dt>
            <dd className="mt-1 text-slate-900">{intake.suggestedCategory ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fieldArtist")}</dt>
            <dd className="mt-1 text-slate-900">{intake.artist ?? "—"}</dd>
          </div>
        </dl>
      </DetailSection>

      <DetailSection title={t("normalizedDataSection")}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t("colTitle")}</dt>
            <dd className="mt-1 font-medium text-slate-900">{normalized.title}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colDistrict")}</dt>
            <dd className="mt-1 text-slate-900">{normalized.districtLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("colVenue")}</dt>
            <dd className="mt-1 text-slate-900">{normalized.venue ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fieldCategory")}</dt>
            <dd className="mt-1 text-slate-900">{normalized.category ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("fieldArtist")}</dt>
            <dd className="mt-1 text-slate-900">{normalized.artist ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">{t("fingerprint")}</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">
              {intake.fingerprint ?? "—"}
            </dd>
          </div>
        </dl>
      </DetailSection>

      <DetailSection title={t("sourceAndEvidence")}>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-slate-500">{t("colSource")}</dt>
            <dd className="mt-1 text-slate-900">{intake.source}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("sourceUrl")}</dt>
            <dd className="mt-1 break-all text-slate-900">{intake.sourceUrl ?? "—"}</dd>
            <p className="mt-1 text-xs text-slate-500">{t("sourceUrlHint")}</p>
          </div>
        </dl>
        {intake.evidence.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm">
            {intake.evidence.map((item) => (
              <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-semibold">{item.type}</span> — {item.sourceUrl}
                <span className="ml-2 text-slate-500">({item.hash})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t("noEvidence")}</p>
        )}
      </DetailSection>

      {intake.aiReview ? (
        <DetailSection title={t("aiReviewResult")}>
          <p className="mb-4 text-xs text-amber-700">{t("aiHintOnly")}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{t("aiConfidence")}</dt>
              <dd className="mt-1 font-medium">{Math.round(intake.aiReview.confidence * 100)}%</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("aiRecommendation")}</dt>
              <dd className="mt-1 font-medium">{intake.aiReview.recommendation}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("aiDistrictMatch")}</dt>
              <dd className="mt-1 font-medium">
                {intake.aiReview.districtMatch ? t("yes") : t("no")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("aiVenueMatch")}</dt>
              <dd className="mt-1 font-medium">
                {intake.aiReview.venueMatch ? t("yes") : t("no")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">{t("aiFlags")}</dt>
              <dd className="mt-1 font-medium">
                {intake.aiReview.flags.length > 0 ? intake.aiReview.flags.join(", ") : "—"}
              </dd>
            </div>
          </dl>
        </DetailSection>
      ) : null}

      {intake.imageCandidates.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">{t("imageCandidates")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {intake.imageCandidates.map((candidate) => (
              <ImageCandidateCard
                key={candidate.id}
                candidate={candidate}
                eventTitle={intake.rawTitle}
                eventDistrictId={intake.suggestedDistrictId}
                eventVenueId={intake.suggestedVenueId}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      <DetailSection title={t("lifecycleHistory")}>
        <LifecycleHistoryList history={history} locale={locale} t={t} />
      </DetailSection>
    </div>
  );
}
