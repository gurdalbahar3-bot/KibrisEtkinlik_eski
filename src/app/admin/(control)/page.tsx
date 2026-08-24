import Link from "next/link";

import { AdminImagePolicyBanner } from "@/components/admin/AdminImagePolicyBanner";
import { getAdminPublicDiscoveryStats } from "@/lib/admin/data/admin-public-stats";
import { getAdminDashboardViewModel } from "@/lib/admin/dashboard-stats";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";

export default async function AdminDashboardPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const dashboard = await getAdminDashboardViewModel();
  const publicStats = await getAdminPublicDiscoveryStats();

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-brand-700">{t("welcomeBack")}</p>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t("dashboard")}</h1>
        <p
          className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            dashboard.dataSource === "supabase"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {dashboard.showMockDataLabel ? `${t("mockData")} · ` : null}
          {t(dashboard.badgeKey)}
        </p>
      </header>

      {publicStats ? (
        <section aria-labelledby="public-discovery-title">
          <h2 id="public-discovery-title" className="text-lg font-semibold text-slate-900">
            {t("publicDiscoveryOverview")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t("publicDiscoverySubtitle")}</p>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <li className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="text-sm font-medium text-emerald-900">
                {t("statPublishedEvents")}
              </span>
              <span className="mt-1 block text-3xl font-bold text-emerald-800">
                {publicStats.publishedEvents}
              </span>
            </li>
            <li className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="text-sm font-medium text-emerald-900">{t("statActiveVenues")}</span>
              <span className="mt-1 block text-3xl font-bold text-emerald-800">
                {publicStats.activeVenues}
              </span>
            </li>
            <li className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="text-sm font-medium text-emerald-900">{t("statDistrictCount")}</span>
              <span className="mt-1 block text-3xl font-bold text-emerald-800">
                {publicStats.districtCount}
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="queue-overview-title">
        <h2 id="queue-overview-title" className="text-lg font-semibold text-slate-900">
          {t("queueOverview")}
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.stats.map((stat) => (
            <li key={stat.id}>
              <Link
                href={stat.href}
                className="flex min-h-[5.5rem] flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
              >
                <span className="text-sm font-medium text-slate-600">{t(stat.labelKey)}</span>
                <span className="mt-1 text-3xl font-bold text-brand-700">{stat.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AdminImagePolicyBanner t={t} />
    </div>
  );
}
