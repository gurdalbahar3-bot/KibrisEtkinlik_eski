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

  const approveError = approveErrorFromQuery(approveErrorParam);
  const approveSuccess =
    Boolean(approved?.trim()) &&
    approved === event.id &&
    (event.status === "approved" || event.status === "published" || !approveError);
  const publishSuccess =
    Boolean(published?.trim()) &&
    published === event.id &&
    (event.status === "published" || !approvePublishError);

  return (
    <EventReviewDetailView
      event={event}
      locale={locale}
      t={t}
      approveSuccess={approveSuccess}
      approveError={approveError}
      publishSuccess={publishSuccess}
      approvePublishError={approvePublishError}
      publicPath={publicPath ?? null}
      basePath={`/${locale}/admin/events`}
    />
  );
}
