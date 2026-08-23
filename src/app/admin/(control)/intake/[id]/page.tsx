import { notFound } from "next/navigation";
import { IntakeDetailView } from "@/components/admin/IntakeDetailView";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminIntakeDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);

  const intake = mockAdminIntakeRepository.getById(id);
  if (!intake) {
    notFound();
  }

  const history = mockAdminIntakeRepository.getHistory(id);

  return <IntakeDetailView intake={intake} history={history} locale={locale} t={t} />;
}
