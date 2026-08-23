import { notFound } from "next/navigation";
import { PublishPreviewView } from "@/components/admin/PublishPreviewView";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminPublishingDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);

  const intake = mockAdminIntakeRepository.getById(id);
  if (!intake) {
    notFound();
  }

  return <PublishPreviewView intake={intake} locale={locale} t={t} />;
}
