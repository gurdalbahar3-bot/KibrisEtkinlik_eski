import { notFound } from "next/navigation";

import { EventReviewDetailView } from "@/components/admin/EventReviewDetailView";
import { approveErrorFromQuery } from "@/lib/admin/approve-event-result";
import { getAdminReviewEventDetailWithTickets } from "@/lib/admin/data/admin-event-review";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { isEventUuid } from "@/lib/admin/publish-event-result";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    approved?: string;
    approveError?: string;
    published?: string;
    publicPath?: string;
    approvePublishError?: string;
  }>;
};

export default async function AdminEventReviewDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const {
    approved,
    approveError: approveErrorParam,
    published,
    publicPath,
    approvePublishError,
  } = await searchParams;

  if (!isEventUuid(id)) {
    notFound();
  }

  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const event = await getAdminReviewEventDetailWithTickets(id);

  if (!event) {
    notFound();
  }

  const isPublishedStatus = event.status === "published";
  const publishSuccessFromQuery =
    Boolean(published?.trim()) && published === event.id;
  // Double-submit can leave only approvePublishError while DB is already published.
  const publishSuccess =
    publishSuccessFromQuery ||
    (isPublishedStatus && Boolean(approvePublishError?.trim()));
  const approveError =
    isPublishedStatus || publishSuccess
      ? undefined
      : approveErrorFromQuery(approveErrorParam);
  const approveSuccess =
    !publishSuccess &&
    !isPublishedStatus &&
    Boolean(approved?.trim()) &&
    approved === event.id &&
    (event.status === "approved" || !approveError);
  const visibleApprovePublishError =
    isPublishedStatus || publishSuccess ? undefined : approvePublishError;

  return (
    <EventReviewDetailView
      event={event}
      locale={locale}
      t={t}
      approveSuccess={approveSuccess}
      approveError={approveError}
      publishSuccess={publishSuccess}
      approvePublishError={visibleApprovePublishError}
      publicPath={publicPath ?? null}
      basePath="/admin/review/events"
    />
  );
}
