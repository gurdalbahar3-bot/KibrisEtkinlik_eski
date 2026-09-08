import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import type { CustomerSession } from "@/types/customer/session";

type ProfileGateRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: string | null;
  verification_status: string | null;
};

async function loadCustomerProfile(userId: string): Promise<ProfileGateRow | null> {
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

function toSession(profile: ProfileGateRow): CustomerSession | null {
  if (profile.account_type !== "customer") {
    return null;
  }

  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    accountType: "customer",
    verificationStatus: profile.verification_status ?? "not_required",
  };
}

/** Current customer session or null. Never elevates to organizer/SA. */
export async function getCustomerSession(): Promise<CustomerSession | null> {
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

  const profile = await loadCustomerProfile(user.id);
  if (!profile) {
    return null;
  }

  return toSession(profile);
}

/**
 * Require a verified customer session.
 * @param loginPath Absolute path (with locale prefix) to redirect when unauthenticated
 *   or when the signed-in account is not a customer (e.g. organizer).
 */
export async function requireCustomer(loginPath = "/tr/giris"): Promise<CustomerSession> {
  const session = await getCustomerSession();
  if (!session) {
    redirect(loginPath);
  }
  return session;
}

export async function assertCustomerProfile(userId: string): Promise<
  | { ok: true; session: CustomerSession }
  | { ok: false; reason: "not_customer" | "profile_missing" }
> {
  const profile = await loadCustomerProfile(userId);
  if (!profile) {
    return { ok: false, reason: "profile_missing" };
  }
  const session = toSession(profile);
  if (!session) {
    return { ok: false, reason: "not_customer" };
  }
  return { ok: true, session };
}
