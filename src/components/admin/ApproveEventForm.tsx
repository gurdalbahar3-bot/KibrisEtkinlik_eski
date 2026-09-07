import { approveEventFormAction } from "@/lib/admin/approve-event-action";
import type { AdminMessages } from "@/lib/admin/i18n";

interface ApproveEventFormProps {
  eventId: string;
  t: (key: keyof AdminMessages) => string;
}

export function ApproveEventForm({ eventId, t }: ApproveEventFormProps) {
  return (
    <form action={approveEventFormAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
      >
        {t("approveEvent")}
      </button>
    </form>
  );
}
