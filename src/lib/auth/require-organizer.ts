import {
  getProfileForUser,
  getSessionUser,
  isApprovedOrganizerAccount,
  type OrganizerProfile,
  type SessionUser,
} from "@/lib/auth/session";

export type OrganizerGuardResult =
  | { status: "ok"; user: SessionUser; profile: OrganizerProfile }
  | { status: "unauthenticated" }
  | { status: "forbidden"; profile: OrganizerProfile | null };

export async function loadOrganizerContext(): Promise<OrganizerGuardResult> {
  const user = await getSessionUser();
  if (!user) {
    return { status: "unauthenticated" };
  }

  const profile = await getProfileForUser(user.id);
  if (!profile || !isApprovedOrganizerAccount(profile)) {
    return { status: "forbidden", profile };
  }

  return { status: "ok", user, profile };
}
