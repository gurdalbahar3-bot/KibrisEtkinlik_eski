import Image from "next/image";
import Link from "next/link";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import { PublishChecklist } from "@/components/admin/PublishChecklist";
import { publishIntakeFormAction } from "@/lib/admin/intake-actions";
import { mockPublishingAdapter } from "@/lib/admin/adapters/mock/mock-publishing";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

interface PublishPreviewViewProps {
  intake: DiscoveredEventIntake;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  errorMessage?: string;
}

export function PublishPreviewView({ intake, locale, t, errorMessage }: PublishPreviewViewProps) {
  const validation = mockPublishingAdapter.validatePublish(intake);
  const preview = mockPublishingAdapter.getPublishPreview(intake, locale);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/publishing" className="text-sm font-medium text-brand-700 hover:underline">
          ← {t("publishing")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{intake.rawTitle}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <IntakeStatusBadge status={intake.status} t={t} />
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
            {t("intakePublishRequiresExistingEvent")}
          </span>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            {t("publicPreview")}
          </h2>
        </div>
        <div className="grid gap-0 lg:grid-cols-2">
          {preview.posterUrl ? (
            <div className="relative aspect-video bg-slate-100 lg:aspect-auto lg:min-h-[280px]">
              <Image src={preview.posterUrl} alt="" fill className="object-cover" sizes="(max-width:768px) 100vw, 50vw" />
            </div>
          ) : null}
          <div className="space-y-3 p-5">
            <h3 className="text-2xl font-bold text-slate-900">{preview.discoveryEvent.title}</h3>
            <p className="text-sm text-slate-600">
              {preview.districtLabel}
              {intake.suggestedVenueId ? ` · ${intake.suggestedVenueId}` : ""}
            </p>
            <p className="text-sm text-slate-600">
              {formatDateTime(intake.suggestedStartsAt, locale)} · {intake.suggestedCategory}
            </p>
            <p className="text-sm text-slate-700">{preview.discoveryEvent.description || "—"}</p>
            <p className="text-sm text-slate-600">
              {intake.officialTicketUrl ? (
                <a href={intake.officialTicketUrl} className="font-medium text-brand-700">
                  {intake.officialTicketUrl}
                </a>
              ) : (
                t("noOfficialTicketUrl")
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("seoPreview")}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-slate-500">{t("seoTitleLabel")}</dt>
            <dd className="font-medium">{preview.seoTitle}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("seoDescriptionLabel")}</dt>
            <dd>{preview.seoDescription}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("canonicalTr")}</dt>
            <dd className="break-all font-mono text-xs">{preview.canonicalTr}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("canonicalEn")}</dt>
            <dd className="break-all font-mono text-xs">{preview.canonicalEn}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("publicUrlPreview")}</dt>
            <dd className="break-all font-mono text-xs">
              {locale === "tr" ? preview.publicUrlTr : preview.publicUrlEn}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("jsonLdPreview")}</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(preview.jsonLd, null, 2)}
        </pre>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("prePublishChecklist")}</h2>
        <div className="mt-3">
          <PublishChecklist items={validation.checklist} t={t} />
        </div>
        {errorMessage ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <form action={publishIntakeFormAction} className="mt-4">
          <input type="hidden" name="intakeId" value={intake.id} />
          <input type="hidden" name="returnTo" value={`/admin/publishing/${intake.id}`} />
          <button
            type="submit"
            disabled={!validation.ok || intake.status !== "APPROVED"}
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("publishEvent")}
          </button>
        </form>
      </section>
    </div>
  );
}
