import { notFound } from "next/navigation";
import { PublishPreviewView } from "@/components/admin/PublishPreviewView";
import { getAdminPublicEventById } from "@/lib/admin/data/admin-events-read";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import {
  publishErrorFromQuery,
  shouldShowPublishSuccess,
} from "@/lib/admin/publish-event-result";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string; publishError?: string }>;
};

export default async function AdminPublishingDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { published, publishError: publishErrorParam } = await searchParams;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);

  const event = await getAdminPublicEventById(id);
  if (!event) {
    notFound();
  }

  const publishError = publishErrorFromQuery(publishErrorParam);
  const publishSuccess = shouldShowPublishSuccess({
    publishedQuery: published,
    eventId: event.id,
    eventStatus: event.status,
    publishErrorQuery: publishError,
  });

  return (
    <PublishPreviewView
      event={event}
      t={t}
      publishSuccess={publishSuccess}
      publishError={publishError}
    />
  );
}
