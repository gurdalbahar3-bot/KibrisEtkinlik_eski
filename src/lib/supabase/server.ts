import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { assertSupabasePublicEnv } from "@/lib/supabase/config";
import type { Database } from "@/types/supabase/database";

/**
 * Cookie-backed Supabase server client for RSC / Server Actions.
 * Uses the anon key only — never the service role.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = assertSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware refreshes sessions.
        }
      },
    },
  });
}
