export interface DevAdminAuthEnv {
  ADMIN_AUTH?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
}

/**
 * Dev cookie auth is allowed only in local development.
 * Production, Vercel preview/production, and ADMIN_AUTH=supabase never use the dev cookie.
 */
export function resolveShouldUseDevAdminAuth(env: DevAdminAuthEnv): boolean {
  if (env.ADMIN_AUTH === "supabase") {
    return false;
  }
  if (env.NODE_ENV !== "development") {
    return false;
  }
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    return false;
  }
  return true;
}

export function shouldUseDevAdminAuth(): boolean {
  return resolveShouldUseDevAdminAuth({
    ADMIN_AUTH: process.env.ADMIN_AUTH,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}

export function shouldUseSupabaseAdminAuth(): boolean {
  return !shouldUseDevAdminAuth();
}
