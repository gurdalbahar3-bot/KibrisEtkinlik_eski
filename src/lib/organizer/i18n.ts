import { cookies, headers } from "next/headers";

import organizerEn from "../../../messages/organizer/en.json";
import organizerTr from "../../../messages/organizer/tr.json";

export type OrganizerLocale = "tr" | "en";

export type OrganizerMessages = typeof organizerTr;

const ORGANIZER_LOCALE_COOKIE = "ged_organizer_locale";

export async function resolveOrganizerLocale(): Promise<OrganizerLocale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(ORGANIZER_LOCALE_COOKIE)?.value;
  if (cookieLocale === "en" || cookieLocale === "tr") {
    return cookieLocale;
  }

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  if (acceptLanguage.toLowerCase().startsWith("en")) {
    return "en";
  }

  return "tr";
}

export function getOrganizerMessages(locale: OrganizerLocale): OrganizerMessages {
  return locale === "en" ? organizerEn : organizerTr;
}

export function createOrganizerTranslator(messages: OrganizerMessages) {
  return function t(key: keyof OrganizerMessages): string {
    return messages[key];
  };
}
