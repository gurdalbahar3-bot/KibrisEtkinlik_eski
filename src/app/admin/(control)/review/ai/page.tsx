import Link from "next/link";

import { AiReviewQueue } from "@/components/admin/AiReviewQueue";
import { OrumcekDraftQueue } from "@/components/admin/OrumcekDraftQueue";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import {
  reloadOrumcekFixturesAction,
  runOrumcekLiveCrawlAction,
} from "@/lib/orumcek/admin-actions";
import { isLiveCrawlFlagOn } from "@/lib/orumcek/crawl-gate";
import { ensureFixtureDrafts } from "@/lib/orumcek/fixtures";
import { PRIMARY_LIVE_CRAWL_SOURCE_ID } from "@/lib/orumcek/sources";
import { getLastOrumcekCrawlRun, listDrafts } from "@/lib/orumcek/store";
import type { IntakeDraft, OrumcekStatus } from "@/lib/orumcek/types";

type ViewFilter = "queue" | "approved" | "rejected" | "all";

function isViewFilter(value: string | undefined): value is ViewFilter {
  return value === "queue" || value === "approved" || value === "rejected" || value === "all";
}

function filterDrafts(drafts: IntakeDraft[], view: ViewFilter): IntakeDraft[] {
  if (view === "all") {
    return drafts;
  }
  if (view === "approved") {
    return drafts.filter((draft) => draft.status === "APPROVED_READY");
  }
  if (view === "rejected") {
    return drafts.filter((draft) => draft.status === "REJECTED");
  }
  const queue: OrumcekStatus[] = ["PENDING_APPROVAL", "REVIEW"];
  return drafts.filter((draft) => queue.includes(draft.status));
}

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function AdminAiReviewPage({ searchParams }: Props) {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const params = await searchParams;
  const view = isViewFilter(params.view) ? params.view : "queue";

  ensureFixtureDrafts();
  const drafts = filterDrafts(listDrafts(), view);
  const intakes = mockAdminIntakeRepository.getByStatus("AI_REVIEW");
  const liveCrawlOn = isLiveCrawlFlagOn();
  const lastCrawl = getLastOrumcekCrawlRun();

  const tabs: { id: ViewFilter; label: string }[] = [
    { id: "queue", label: t("orumcekFilterQueue") },
    { id: "approved", label: t("orumcekFilterApproved") },
    { id: "rejected", label: t("orumcekFilterRejected") },
    { id: "all", label: t("filterAll") },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("orumcekTitle")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("orumcekSubtitle")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {liveCrawlOn ? t("orumcekLiveCrawlGatedBadge") : t("orumcekFixturesOnlyBadge")}
            </span>
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              {t("orumcekNoAutoPublishBadge")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={reloadOrumcekFixturesAction}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("orumcekReloadFixtures")}
            </button>
          </form>
          <form action={runOrumcekLiveCrawlAction}>
            <input type="hidden" name="sourceId" value={PRIMARY_LIVE_CRAWL_SOURCE_ID} />
            <button
              type="submit"
              disabled={!liveCrawlOn}
              className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {t("orumcekRunLiveCrawl")}
            </button>
          </form>
        </div>
      </header>

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {liveCrawlOn ? t("orumcekLiveCrawlEnabledHint") : t("orumcekLiveCrawlDisabledHint")}
      </p>

      {lastCrawl ? (
        <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm">
          <h2 className="font-semibold text-slate-900">{t("orumcekLastCrawl")}</h2>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">{t("orumcekCrawlSource")}</dt>
              <dd className="font-medium text-slate-900">{lastCrawl.sourceName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("orumcekCrawlIngested")}</dt>
              <dd className="font-medium text-slate-900">{lastCrawl.ingested}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("orumcekCrawlDuplicates")}</dt>
              <dd className="font-medium text-slate-900">{lastCrawl.duplicates}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("orumcekCrawlSkipped")}</dt>
              <dd className="font-medium text-slate-900">{lastCrawl.skipped}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("orumcekNoPublicWrite")}</dt>
              <dd className="font-medium text-slate-900">{t("orumcekReadyForSaOnly")}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label={t("orumcekTitle")}>
        {tabs.map((tab) => {
          const active = tab.id === view;
          return (
            <Link
              key={tab.id}
              href={tab.id === "queue" ? "/admin/review/ai" : `/admin/review/ai?view=${tab.id}`}
              className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${
                active
                  ? "bg-brand-700 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <OrumcekDraftQueue drafts={drafts} locale={locale} t={t} />

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">{t("aiReview")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("aiReviewSubtitle")}</p>
        </header>
        <AiReviewQueue intakes={intakes} locale={locale} t={t} />
      </section>
    </div>
  );
}
