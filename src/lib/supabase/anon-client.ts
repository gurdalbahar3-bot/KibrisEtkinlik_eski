import { createClient } from "@supabase/supabase-js";

import { assertSupabasePublicEnv } from "@/lib/supabase/config";
import type { Database } from "@/types/supabase/database";

/**
 * Stateless anon client for public discovery READ (RLS-enforced).
 * No cookies/session — safe for scripts and RSC data loaders.
 */
export function createSupabaseAnonClient() {
  const { url, anonKey } = assertSupabasePublicEnv();
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
