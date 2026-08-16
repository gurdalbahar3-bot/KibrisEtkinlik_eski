import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  localePrefix: "always",
  pathnames: {
    "/": "/",
    "/events": {
      tr: "/etkinlikler",
      en: "/events",
    },
    "/events/[slug]": {
      tr: "/etkinlikler/[slug]",
      en: "/events/[slug]",
    },
    "/categories": {
      tr: "/kategoriler",
      en: "/categories",
    },
    "/categories/[category]": {
      tr: "/kategoriler/[category]",
      en: "/categories/[category]",
    },
    "/venues": {
      tr: "/mekanlar",
      en: "/venues",
    },
    "/venues/[slug]": {
      tr: "/mekanlar/[slug]",
      en: "/venues/[slug]",
    },
    "/districts": {
      tr: "/ilceler",
      en: "/districts",
    },
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathnames = keyof typeof routing.pathnames;
