import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { listOrganizerEvents } from "@/lib/organizer/data";

export default async function OrganizerDashboardPage() {
  const t = await getTranslations("organizer");
  const events = await listOrganizerEvents();
  const draftCount = events.filter((e) => e.status === "draft").length;
  const publishedCount = events.filter((e) => e.status === "published").length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("dashboardTitle")}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{t("dashboardSubtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("statTotal")} value={String(events.length)} />
        <StatCard label={t("statDraft")} value={String(draftCount)} />
        <StatCard label={t("statPublished")} value={String(publishedCount)} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/organizer/events"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          {t("ctaMyEvents")}
        </Link>
        <Link href="/organizer/events/new" className="btn-primary">
          {t("ctaNewEvent")}
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
