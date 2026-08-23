import { AiReviewQueue } from "@/components/admin/AiReviewQueue";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

export default async function AdminAiReviewPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const intakes = mockAdminIntakeRepository.getByStatus("AI_REVIEW");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("aiReview")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("aiReviewSubtitle")}</p>
      </header>
      <AiReviewQueue intakes={intakes} locale={locale} t={t} />
    </div>
  );
}
