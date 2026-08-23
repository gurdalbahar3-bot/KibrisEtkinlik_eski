import { AdminEventsTable } from "@/components/admin/AdminEventsTable";
import { getAdminPublicEvents } from "@/lib/admin/data/admin-events-read";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";

export default async function AdminEventsPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const events = await getAdminPublicEvents();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("events")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("adminEventsSubtitle")}</p>
        <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          {t("adminEventsReadOnlyBadge")}
        </p>
      </header>
      <AdminEventsTable events={events} t={t} />
    </div>
  );
}
