import createMiddleware from "next-intl/middleware";
import { routing } from "./lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // /admin stays unprefixed; this matcher never locale-rewrites it.
  matcher: ["/", "/(tr|en)/:path*"],
};
