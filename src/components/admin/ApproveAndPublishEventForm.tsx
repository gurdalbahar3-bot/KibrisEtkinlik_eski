"use client";

import { useFormStatus } from "react-dom";

import { approveAndPublishEventFormAction } from "@/lib/admin/approve-and-publish-event-action";
import type { AdminMessages } from "@/lib/admin/i18n";

interface ApproveAndPublishEventFormProps {
  eventId: string;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  returnBase?: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
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
      <SubmitButton label={t("approveAndPublish")} />
    </form>
  );
}
