import { devAdminAuth } from "@/lib/admin/auth/dev-admin-auth";
import { shouldUseDevAdminAuth } from "@/lib/admin/auth/should-use-dev-admin-auth";
import { supabaseAdminAuth } from "@/lib/admin/auth/supabase-admin-auth";
import type { AdminAuthPort } from "@/lib/admin/auth/port";

/** Returns the active admin auth adapter (dev cookie vs Supabase session). */
export function getAdminAuth(): AdminAuthPort {
  return shouldUseDevAdminAuth() ? devAdminAuth : supabaseAdminAuth;
}

export { type AdminAuthPort } from "@/lib/admin/auth/port";
