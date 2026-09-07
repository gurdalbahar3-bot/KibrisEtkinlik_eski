import Link from "next/link";
import { redirect } from "next/navigation";

import { loginOrganizerAction } from "@/app/organizer/login/actions";
import { getOrganizerSession } from "@/lib/organizer/auth";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OrganizerLoginPage({ searchParams }: Props) {
  const session = await getOrganizerSession();
  if (session) {
    redirect("/organizer");
  }

  const { error } = await searchParams;
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const configured = Boolean(getSupabasePublicEnv());

  let errorMessage: string | null = null;
  switch (error) {
    case "invalid":
      errorMessage = t("loginErrorInvalid");
      break;
    case "not_organizer":
      errorMessage = t("loginErrorNotOrganizer");
      break;
    case "missing":
      errorMessage = t("loginErrorMissing");
      break;
    case "config":
      errorMessage = t("loginErrorConfig");
      break;
    default:
      break;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-950 via-slate-900 to-cyan-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("loginSubtitle")}</p>

        {errorMessage ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {configured ? (
          <>
            <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900">{t("loginHint")}</p>
            <form action={loginOrganizerAction} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  {t("loginEmail")}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  {t("loginPassword")}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                {t("loginButton")}
              </button>
            </form>
          </>
        ) : (
          <p className="mt-6 rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-700">
            {t("loginErrorConfig")}
          </p>
        )}

        <Link
          href="/tr"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-teal-800 hover:underline"
        >
          ← {t("publicSite")}
        </Link>
      </div>
    </div>
  );
}
