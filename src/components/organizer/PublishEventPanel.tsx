"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

type Props = {
  eventId: string;
  publicSlug?: string;
  /** @deprecated Ignored — organizer publish is disabled. */
  canPublish?: boolean;
};

/**
 * Organizer cannot publish. Guides users to canonical /organizer submit-for-review flow.
 */
export function PublishEventPanel({ eventId }: Props) {
  const t = useTranslations("organizer");
  const locale = useLocale();

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
      <h3 className="font-semibold text-amber-950">{t("approvalRequiredHeading")}</h3>
      <p className="text-sm text-amber-900">{t("approvalRequiredBody")}</p>
      <p className="text-sm text-amber-900">{t("approvalRequiredSteps")}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/organizer/events/${eventId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          {t("goToCanonicalOrganizer")}
        </Link>
        <Link
          href={`/${locale}/organizer/events/${eventId}/tickets`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-50"
        >
          {t("manageTickets")}
        </Link>
      </div>
    </div>
  );
}
