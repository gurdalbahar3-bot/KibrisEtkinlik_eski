import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import type { CustomerSession } from "@/types/customer/session";
import type { DbAccountType } from "@/types/supabase/database";

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

const STOREFRONT_ACCOUNT_TYPES = new Set<DbAccountType>([
  "customer",
  "organizer",
  "venue_owner",
]);

function isStorefrontAccountType(value: string | null): value is DbAccountType {
  return value !== null && STOREFRONT_ACCOUNT_TYPES.has(value as DbAccountType);
}

function toSession(profile: ProfileGateRow): CustomerSession | null {
  if (!isStorefrontAccountType(profile.account_type)) {
    return null;
  }

  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    accountType: profile.account_type,
    verificationStatus: profile.verification_status ?? "not_required",
  };
}

/** Current storefront session or null. Never elevates to Super Admin. */
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
 * Require an authenticated storefront session (customer, organizer, or venue_owner).
 * @param loginPath Absolute path (with locale prefix) to redirect when unauthenticated.
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
