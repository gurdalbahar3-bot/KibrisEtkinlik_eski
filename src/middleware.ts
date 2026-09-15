import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/lib/i18n/routing";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

function resolveLocaleFromPath(pathname: string): "tr" | "en" {
  const first = pathname.split("/").filter(Boolean)[0];
  return first === "en" ? "en" : "tr";
}

/**
 * Forward Supabase auth payloads that landed on Site URL / locale home
 * (common for recovery emails) into the locale auth callback.
 */
function redirectAuthPayloadToCallback(request: NextRequest): NextResponse | null {
  const url = request.nextUrl;
  const pathname = url.pathname;

  if (pathname.includes("/auth/callback")) {
    return null;
  }

  const hasCode = url.searchParams.has("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const hasTokenHash = Boolean(tokenHash && type);

  if (!hasCode && !hasTokenHash) {
    return null;
  }

  const locale = resolveLocaleFromPath(pathname);
  const dest = request.nextUrl.clone();
  dest.pathname = `/${locale}/auth/callback`;
  return NextResponse.redirect(dest);
}

export default async function middleware(request: NextRequest) {
  const authRedirect = redirectAuthPayloadToCallback(request);
  if (authRedirect) {
    return authRedirect;
  }

  const intlResponse = intlMiddleware(request);
  return updateSupabaseSession(request, intlResponse);
}

export const config = {
  // /admin stays unprefixed; this matcher never locale-rewrites it.
  matcher: ["/", "/(tr|en)/:path*"],
};
