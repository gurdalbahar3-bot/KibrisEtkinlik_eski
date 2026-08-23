import { AccountApplicationQueue } from "@/components/admin/AccountApplicationQueue";
import { ApprovalQueue } from "@/components/admin/ApprovalQueue";
import { listPendingAccountApplicationsForAdmin } from "@/lib/admin/data/admin-account-applications";
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
  const accountApplications = await listPendingAccountApplicationsForAdmin();
  const intakes = mockAdminIntakeRepository.getByStatus("PENDING_APPROVAL");
  const historyByIntake = Object.fromEntries(
    intakes.map((intake) => [intake.id, mockAdminIntakeRepository.getHistory(intake.id)])
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("approval")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("approvalSubtitle")}</p>
      </header>

      {accountApplications ? (
        <section aria-labelledby="account-applications-title" className="space-y-4">
          <div>
            <h2 id="account-applications-title" className="text-lg font-semibold text-slate-900">
              {t("accountApplicationsTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t("accountApplicationsSubtitle")}</p>
            <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {t("accountApplicationsLive")}
            </p>
          </div>
          <AccountApplicationQueue applications={accountApplications} locale={locale} t={t} />
        </section>
      ) : null}

      <section aria-labelledby="intake-approval-title" className="space-y-4">
        <h2 id="intake-approval-title" className="text-lg font-semibold text-slate-900">
          {t("approval")}
        </h2>
        <ApprovalQueue intakes={intakes} historyByIntake={historyByIntake} locale={locale} t={t} />
      </section>
    </div>
  );
}
