import { PublishingQueue } from "@/components/admin/PublishingQueue";
import { getAdminPublishableEvents } from "@/lib/admin/data/admin-events-read";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { publishErrorFromQuery } from "@/lib/admin/publish-event-result";

type Props = {
  searchParams: Promise<{ publishError?: string }>;
};

export default async function AdminPublishingPage({ searchParams }: Props) {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const events = await getAdminPublishableEvents();
  const { publishError: publishErrorParam } = await searchParams;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("publishing")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("publishingSubtitle")}</p>
      </header>
      <PublishingQueue
        events={events}
        locale={locale}
        t={t}
        publishError={publishErrorFromQuery(publishErrorParam)}
      />
    </div>
  );
}
