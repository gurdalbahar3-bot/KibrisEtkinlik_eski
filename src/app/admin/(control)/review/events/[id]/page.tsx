import { notFound } from "next/navigation";

import { EventReviewDetailView } from "@/components/admin/EventReviewDetailView";
import { approveErrorFromQuery } from "@/lib/admin/approve-event-result";
import { getAdminReviewEventById } from "@/lib/admin/data/admin-event-review";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { isEventUuid } from "@/lib/admin/publish-event-result";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ approved?: string; approveError?: string }>;
};

export default async function AdminEventReviewDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { approved, approveError: approveErrorParam } = await searchParams;

  if (!isEventUuid(id)) {
    notFound();
  }

  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const event = await getAdminReviewEventById(id);

  if (!event) {
    notFound();
  }

  const approveError = approveErrorFromQuery(approveErrorParam);
  const approveSuccess =
    Boolean(approved?.trim()) &&
    approved === event.id &&
    (event.status === "approved" || !approveError);

  return (
    <EventReviewDetailView
      event={event}
      locale={locale}
      t={t}
      approveSuccess={approveSuccess}
      approveError={approveError}
    />
  );
}
