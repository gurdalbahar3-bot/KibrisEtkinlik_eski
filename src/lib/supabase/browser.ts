import { createBrowserClient } from "@supabase/ssr";

import { assertSupabasePublicEnv } from "@/lib/supabase/config";
import type { Database } from "@/types/supabase/database";

/**
 * Browser Supabase client (anon key + cookie session via @supabase/ssr).
 * Never embed or import the service role key here.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = assertSupabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
