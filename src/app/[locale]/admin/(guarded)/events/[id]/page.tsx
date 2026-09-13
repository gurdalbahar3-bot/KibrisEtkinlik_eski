import { notFound } from "next/navigation";

import { EventReviewDetailView } from "@/components/admin/EventReviewDetailView";
import { approveErrorFromQuery } from "@/lib/admin/approve-event-result";
import { getAdminReviewEventDetailWithTickets } from "@/lib/admin/data/admin-event-review";
import {
  createAdminTranslator,
  getAdminMessages,
} from "@/lib/admin/i18n";
import { isEventUuid } from "@/lib/admin/publish-event-result";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    approved?: string;
    approveError?: string;
    published?: string;
    publicPath?: string;
    approvePublishError?: string;
  }>;
};

export default async function LocaleAdminEventDetailPage({ params, searchParams }: Props) {
  const { locale: localeRaw, id } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
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
      basePath={`/${locale}/admin/events`}
    />
  );
}
