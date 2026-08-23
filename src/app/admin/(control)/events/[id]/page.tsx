import { notFound } from "next/navigation";

import { AdminEventDetailView } from "@/components/admin/AdminEventDetailView";
import { canSuperAdminWriteEvents } from "@/lib/admin/data/admin-event-lifecycle-rpc";
import { getAdminPublicEventById } from "@/lib/admin/data/admin-events-read";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; published?: string; postponed?: string; rescheduled?: string }>;
};

export default async function AdminEventDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const [event, canWriteEvents] = await Promise.all([
    getAdminPublicEventById(id),
    canSuperAdminWriteEvents(),
  ]);

  if (!event) {
    notFound();
  }

  const successCode = query.published
    ? "published"
    : query.postponed
      ? "postponed"
      : query.rescheduled
        ? "rescheduled"
        : undefined;

  return (
    <AdminEventDetailView
      event={event}
      t={t}
      canWriteEvents={canWriteEvents}
      errorCode={query.error}
      successCode={successCode}
    />
  );
}
