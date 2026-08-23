import { ApprovalQueue } from "@/components/admin/ApprovalQueue";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

export default async function AdminApprovalPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const intakes = mockAdminIntakeRepository.getByStatus("PENDING_APPROVAL");
  const historyByIntake = Object.fromEntries(
    intakes.map((intake) => [intake.id, mockAdminIntakeRepository.getHistory(intake.id)])
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("approval")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("approvalSubtitle")}</p>
      </header>
      <ApprovalQueue intakes={intakes} historyByIntake={historyByIntake} locale={locale} t={t} />
    </div>
  );
}
