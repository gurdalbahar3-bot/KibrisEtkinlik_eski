import { type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/lib/i18n/routing";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);
  return updateSupabaseSession(request, intlResponse);
}

export const config = {
  matcher: ["/", "/(tr|en)/:path*"],
};
