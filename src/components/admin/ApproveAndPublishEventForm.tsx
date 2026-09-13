import { approveAndPublishEventFormAction } from "@/lib/admin/approve-and-publish-event-action";
import type { AdminMessages } from "@/lib/admin/i18n";

interface ApproveAndPublishEventFormProps {
  eventId: string;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  returnBase?: string;
}

export function ApproveAndPublishEventForm({
  eventId,
  locale,
  t,
  returnBase = "/admin/review/events",
}: ApproveAndPublishEventFormProps) {
  return (
    <form action={approveAndPublishEventFormAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnBase" value={returnBase} />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
      >
        {t("approveAndPublish")}
      </button>
    </form>
  );
}
