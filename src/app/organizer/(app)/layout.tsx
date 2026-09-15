import { logoutOrganizerAction } from "@/app/organizer/login/actions";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { requireOrganizer } from "@/lib/organizer/auth";
import { getOrganizerMessages, resolveOrganizerLocale } from "@/lib/organizer/i18n";

export default async function OrganizerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireOrganizer();
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const displayName = session.fullName?.trim() || session.email || session.userId.slice(0, 8);

  return (
    <OrganizerShell
      messages={messages}
      logoutAction={logoutOrganizerAction}
      displayName={displayName}
    >
      {children}
    </OrganizerShell>
  );
}
