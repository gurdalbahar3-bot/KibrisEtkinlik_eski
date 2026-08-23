/**
 * Dev cookie auth is allowed only in local development unless explicitly overridden.
 * Production and staging builds must use Supabase Auth + is_super_admin().
 */
export function shouldUseDevAdminAuth(): boolean {
  if (process.env.ADMIN_AUTH === "supabase") {
    return false;
  }
  return process.env.NODE_ENV === "development";
}

export function shouldUseSupabaseAdminAuth(): boolean {
  return !shouldUseDevAdminAuth();
}
