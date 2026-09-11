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
    "/login": {
      tr: "/giris",
      en: "/login",
    },
    "/signup": {
      tr: "/kayit",
      en: "/signup",
    },
    "/checkout": {
      tr: "/odeme",
      en: "/checkout",
    },
    "/checkout/success": {
      tr: "/odeme/basarili",
      en: "/checkout/success",
    },
    "/checkout/failure": {
      tr: "/odeme/basarisiz",
      en: "/checkout/failure",
    },
    "/account/orders": {
      tr: "/hesap/siparisler",
      en: "/account/orders",
    },
    "/account/orders/[id]": {
      tr: "/hesap/siparisler/[id]",
      en: "/account/orders/[id]",
    },
    "/account/tickets": {
      tr: "/hesap/biletler",
      en: "/account/tickets",
    },
    "/account/tickets/[id]": {
      tr: "/hesap/biletler/[id]",
      en: "/account/tickets/[id]",
    },
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathnames = keyof typeof routing.pathnames;
