import { publishEventFormAction } from "@/lib/admin/publish-event-action";
import type { AdminMessages } from "@/lib/admin/i18n";

interface PublishEventFormProps {
  eventId: string;
  returnPath: string;
  t: (key: keyof AdminMessages) => string;
}

export function PublishEventForm({ eventId, returnPath, t }: PublishEventFormProps) {
  return (
    <form action={publishEventFormAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <button
        type="submit"
        className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
      >
        {t("publishEvent")}
      </button>
    </form>
  );
}
