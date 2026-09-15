import { AdminEventsTable } from "@/components/admin/AdminEventsTable";
import { getAdminPublicEvents } from "@/lib/admin/data/admin-events-read";
import { getPublishingBadgeKey } from "@/lib/admin/dashboard-view-model";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { getDataSource } from "@/lib/supabase/config";

export default async function AdminEventsPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const events = await getAdminPublicEvents();
  const badgeKey = getPublishingBadgeKey(getDataSource());
  const live = badgeKey === "realPublishingBadge";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("events")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("adminEventsSubtitle")}</p>
        <p
          className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            live ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {t(badgeKey)}
        </p>
      </header>
      <AdminEventsTable events={events} t={t} />
    </div>
  );
}
