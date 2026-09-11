import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://globaleventdiscovery.com";

/**
 * Public crawl policy — discovery surfaces only.
 * Disallow private/commerce paths in both TR and EN locale prefixes.
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
        "/*/odeme",
        "/*/account",
        "/*/hesap",
        "/*/login",
        "/*/giris",
        "/*/signup",
        "/*/kayit",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
