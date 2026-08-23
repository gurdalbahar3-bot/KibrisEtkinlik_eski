import { IntakeInbox } from "@/components/admin/IntakeInbox";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";
import type { IntakeSource } from "@/types/admin/intake";
import type { IntakeStatus } from "@/types/admin/lifecycle";
import { INTAKE_STATUSES } from "@/types/admin/lifecycle";

type Props = {
  searchParams: Promise<{ status?: string; source?: string }>;
};

const INTAKE_SOURCES: IntakeSource[] = ["SPIDER", "MANUAL", "ORGANIZER_SUBMIT"];

export default async function AdminIntakePage({ searchParams }: Props) {
  const { status: statusParam, source: sourceParam } = await searchParams;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);

  const currentStatus = INTAKE_STATUSES.includes(statusParam as IntakeStatus)
    ? (statusParam as IntakeStatus)
    : undefined;

  const currentSource = INTAKE_SOURCES.includes(sourceParam as IntakeSource)
    ? (sourceParam as IntakeSource)
    : undefined;

  let intakes = mockAdminIntakeRepository.getAll();

  if (currentStatus) {
    intakes = intakes.filter((item) => item.status === currentStatus);
  }

  if (currentSource) {
    intakes = intakes.filter((item) => item.source === currentSource);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("intake")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("intakeInboxSubtitle")}</p>
      </header>
      <IntakeInbox
        intakes={intakes}
        currentStatus={currentStatus}
        currentSource={currentSource}
        locale={locale}
        t={t}
      />
    </div>
  );
}
