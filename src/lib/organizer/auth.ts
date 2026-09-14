import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import type { OrganizerSession } from "@/types/organizer/session";

type ProfileGateRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: string | null;
  verification_status: string | null;
};

async function loadOrganizerProfile(userId: string): Promise<ProfileGateRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, account_type, verification_status")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ProfileGateRow;
}

/**
 * Organizer OS gate: approved organizer or venue_owner only.
 * Customer storefront access is intentionally separate and more permissive.
 */
function toSession(profile: ProfileGateRow): OrganizerSession | null {
  const accountType = profile.account_type;
  if (
    (accountType !== "organizer" && accountType !== "venue_owner") ||
    profile.verification_status !== "approved"
  ) {
    return null;
  }

  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    accountType,
    verificationStatus: profile.verification_status,
  };
}

/** Current organizer session or null. Never elevates to Super Admin. */
export async function getOrganizerSession(): Promise<OrganizerSession | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = await loadOrganizerProfile(user.id);
  if (!profile) {
    return null;
  }

  return toSession(profile);
}

export async function requireOrganizer(): Promise<OrganizerSession> {
  const session = await getOrganizerSession();
  if (!session) {
    redirect("/organizer/login");
  }
  return session;
}

export async function assertOrganizerProfile(userId: string): Promise<
  | { ok: true; session: OrganizerSession }
  | { ok: false; reason: "not_organizer" | "profile_missing" }
> {
  const profile = await loadOrganizerProfile(userId);
  if (!profile) {
    return { ok: false, reason: "profile_missing" };
  }
  const session = toSession(profile);
  if (!session) {
    return { ok: false, reason: "not_organizer" };
  }
  return { ok: true, session };
}
