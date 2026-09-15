import Link from "next/link";

import { AiReviewQueue } from "@/components/admin/AiReviewQueue";
import { OrumcekDraftQueue } from "@/components/admin/OrumcekDraftQueue";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import { reloadOrumcekFixturesAction } from "@/lib/orumcek/admin-actions";
import { ensureFixtureDrafts } from "@/lib/orumcek/fixtures";
import { listDrafts } from "@/lib/orumcek/store";
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
              {t("orumcekFixturesOnlyBadge")}
            </span>
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              {t("orumcekNoAutoPublishBadge")}
            </span>
          </div>
        </div>
        <form action={reloadOrumcekFixturesAction}>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("orumcekReloadFixtures")}
          </button>
        </form>
      </header>

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
