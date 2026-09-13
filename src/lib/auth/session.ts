import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbAccountType, DbVerificationStatus } from "@/types/supabase/database";

export type OrganizerProfile = {
  id: string;
  email: string;
  full_name: string | null;
  account_type: DbAccountType;
  verification_status: DbVerificationStatus;
};

export type SessionUser = {
  id: string;
  email: string | undefined;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!getSupabasePublicEnv()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function getProfileForUser(userId: string): Promise<OrganizerProfile | null> {
  if (!getSupabasePublicEnv()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, account_type, verification_status")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    account_type: data.account_type,
    verification_status: data.verification_status,
  };
}

export function isApprovedOrganizerAccount(profile: OrganizerProfile): boolean {
  return (
    (profile.account_type === "organizer" || profile.account_type === "venue_owner") &&
    profile.verification_status === "approved"
  );
}
