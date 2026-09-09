import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertSupabasePublicEnv } from "@/lib/supabase/config";
import type { Database } from "@/types/supabase/database";

/**
 * Server-only Supabase client with service_role.
 * Never import from Client Components or any file that can reach the browser bundle.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient<Database> {
  const { url } = assertSupabasePublicEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for payment service-role operations."
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function assertStagingSupabaseHostForPayments(
  url = process.env.SUPABASE_URL?.trim() ?? ""
): void {
  const stagingHost = "nksctgxmkymmiubkrohf.supabase.co";
  const productionHost = "jgvyyiojicvgsxoxlmdv.supabase.co";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("Invalid SUPABASE_URL for payment operations.");
  }
  if (host === productionHost) {
    throw new Error("Refusing payment operations against production Supabase.");
  }
  if (host !== stagingHost && process.env.NODE_ENV === "production") {
    throw new Error("Payment operations require staging Supabase host.");
  }
}
