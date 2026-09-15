import { AdminEventDetailView } from "@/components/admin/AdminEventDetailView";
import { PublishChecklist } from "@/components/admin/PublishChecklist";
import { buildDefaultEventPublishChecklist } from "@/lib/admin/publish-event-result";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminEventDetail } from "@/lib/admin/data/admin-events-read";

interface PublishPreviewViewProps {
  event: AdminEventDetail;
  t: (key: keyof AdminMessages) => string;
  publishSuccess?: boolean;
  publishError?: string;
}

export function PublishPreviewView({
  event,
  t,
  publishSuccess = false,
  publishError,
}: PublishPreviewViewProps) {
  const checklist = buildDefaultEventPublishChecklist(event);

  return (
    <div className="space-y-6">
      <AdminEventDetailView
        event={event}
        t={t}
        backHref="/admin/publishing"
        backLabel={t("publishing")}
        showPublish
        publishReturnPath={`/admin/publishing/${event.id}`}
        publishSuccess={publishSuccess}
        publishError={publishError}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("prePublishChecklist")}</h2>
        <div className="mt-3">
          <PublishChecklist items={checklist} t={t} />
        </div>
      </section>
    </div>
  );
}
