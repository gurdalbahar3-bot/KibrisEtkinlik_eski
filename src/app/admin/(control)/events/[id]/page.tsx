import { notFound } from "next/navigation";

import { AdminEventDetailView } from "@/components/admin/AdminEventDetailView";
import { getAdminPublicEventById } from "@/lib/admin/data/admin-events-read";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminEventDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const event = await getAdminPublicEventById(id);

  if (!event) {
    notFound();
  }

  return <AdminEventDetailView event={event} t={t} />;
}
