import { EventReviewQueue } from "@/components/admin/EventReviewQueue";
import { getAdminInReviewEvents } from "@/lib/admin/data/admin-event-review";
import {
  createAdminTranslator,
  getAdminMessages,
} from "@/lib/admin/i18n";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export default async function LocaleAdminEventsPage({ params }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const events = await getAdminInReviewEvents();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("eventReview")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("eventReviewSubtitle")}</p>
      </header>
      <EventReviewQueue
        events={events}
        locale={locale}
        t={t}
        basePath={`/${locale}/admin/events`}
      />
    </div>
  );
}
