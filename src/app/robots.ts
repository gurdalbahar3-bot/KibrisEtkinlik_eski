import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

/**
 * Public crawl policy — discovery surfaces only.
 * Organizer/admin/checkout/account are disallowed (noindex intent via robots).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/organizer",
        "/admin",
        "/api",
        "/*/checkout",
        "/*/account",
        "/*/login",
        "/*/signup",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
