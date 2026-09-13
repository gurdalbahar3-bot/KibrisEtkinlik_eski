import { approveEventFormAction } from "@/lib/admin/approve-event-action";
import type { AdminMessages } from "@/lib/admin/i18n";

interface ApproveEventFormProps {
  eventId: string;
  t: (key: keyof AdminMessages) => string;
  returnBase?: string;
}

export function ApproveEventForm({
  eventId,
  t,
  returnBase = "/admin/review/events",
}: ApproveEventFormProps) {
  return (
    <form action={approveEventFormAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnBase" value={returnBase} />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-300 bg-white px-4 text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
      >
        {t("approveEvent")}
      </button>
    </form>
  );
}
