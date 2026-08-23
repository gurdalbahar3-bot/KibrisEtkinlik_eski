import { cookies, headers } from "next/headers";
import adminEn from "../../../messages/admin/en.json";
import adminTr from "../../../messages/admin/tr.json";

export type AdminLocale = "tr" | "en";

export type AdminMessages = typeof adminTr;

const ADMIN_LOCALE_COOKIE = "ged_admin_locale";

export async function resolveAdminLocale(): Promise<AdminLocale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(ADMIN_LOCALE_COOKIE)?.value;
  if (cookieLocale === "en" || cookieLocale === "tr") {
    return cookieLocale;
  }

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  if (acceptLanguage.toLowerCase().startsWith("en")) {
    return "en";
  }

  return "tr";
}

export function getAdminMessages(locale: AdminLocale): AdminMessages {
  return locale === "en" ? adminEn : adminTr;
}

export function createAdminTranslator(messages: AdminMessages) {
  return function t(key: keyof AdminMessages): string {
    return messages[key];
  };
}
