import { PublishingQueue } from "@/components/admin/PublishingQueue";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

export default async function AdminPublishingPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const intakes = mockAdminIntakeRepository.getByStatus("APPROVED");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("publishing")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("publishingSubtitle")}</p>
      </header>
      <PublishingQueue intakes={intakes} locale={locale} t={t} />
    </div>
  );
}
