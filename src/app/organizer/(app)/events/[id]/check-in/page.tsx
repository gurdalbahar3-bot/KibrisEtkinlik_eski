import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckInScanner } from "@/components/organizer/CheckInScanner";
import { requireOrganizer } from "@/lib/organizer/auth";
import { getOrganizerEvent } from "@/lib/organizer/data/events";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { isEventUuid } from "@/lib/organizer/rpc";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrganizerEventCheckInPage({ params }: Props) {
  const session = await requireOrganizer();
  const { id } = await params;

  if (!isEventUuid(id)) {
    notFound();
  }

  const event = await getOrganizerEvent(id, session.userId);
  if (!event) {
    notFound();
  }

  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);

  return (
    <div className="mx-auto max-w-md space-y-4 px-1 pb-10">
      <Link
        href={`/organizer/events/${event.id}`}
        className="text-sm font-medium text-teal-800 hover:underline"
      >
        ← {event.title}
      </Link>

      <CheckInScanner
        eventId={event.id}
        messages={{
          title: t("checkInTitle"),
          subtitle: t("checkInSubtitle"),
          tokenLabel: t("checkInTokenLabel"),
          tokenPlaceholder: t("checkInTokenPlaceholder"),
          submit: t("checkInSubmit"),
          scanning: t("checkInScanning"),
          success: t("checkInSuccess"),
          alreadyUsed: t("checkInAlreadyUsed"),
          invalid: t("checkInInvalid"),
          wrongEvent: t("checkInWrongEvent"),
          cancelled: t("checkInCancelled"),
          revoked: t("checkInRevoked"),
          forbidden: t("checkInForbidden"),
          expired: t("checkInExpired"),
          notActive: t("checkInNotActive"),
          postponed: t("checkInPostponed"),
          cameraHint: t("checkInCameraHint"),
          startCamera: t("checkInStartCamera"),
          stopCamera: t("checkInStopCamera"),
          cameraUnsupported: t("checkInCameraUnsupported"),
        }}
      />
    </div>
  );
}
