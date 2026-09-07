import { EventReviewQueue } from "@/components/admin/EventReviewQueue";
import { getAdminInReviewEvents } from "@/lib/admin/data/admin-event-review";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";

export default async function AdminEventReviewQueuePage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const events = await getAdminInReviewEvents();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("eventReview")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("eventReviewSubtitle")}</p>
      </header>
      <EventReviewQueue events={events} locale={locale} t={t} />
    </div>
  );
}
