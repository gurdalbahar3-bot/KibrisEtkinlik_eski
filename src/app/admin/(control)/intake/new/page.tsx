import Link from "next/link";
import { ManualIntakeForm } from "@/components/admin/ManualIntakeForm";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";

export default async function AdminManualIntakePage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/intake" className="text-sm font-medium text-brand-700 hover:underline">
          ← {t("intake")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{t("newIntake")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("newIntakeSubtitle")}</p>
      </header>
      <ManualIntakeForm locale={locale} t={t} />
    </div>
  );
}
