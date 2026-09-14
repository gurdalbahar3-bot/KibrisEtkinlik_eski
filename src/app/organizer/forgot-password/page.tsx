import Link from "next/link";

import { OrganizerForgotPasswordForm } from "@/components/organizer/OrganizerForgotPasswordForm";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

type Props = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export const dynamic = "force-dynamic";

export default async function OrganizerForgotPasswordPage({ searchParams }: Props) {
  const query = await searchParams;
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const configured = Boolean(getSupabasePublicEnv());

  let errorMessage: string | null = null;
  switch (query.error) {
    case "missing":
      errorMessage = t("forgotErrorMissing");
      break;
    case "send":
      errorMessage = t("forgotErrorSend");
      break;
    case "config":
      errorMessage = t("forgotErrorConfig");
      break;
    default:
      break;
  }

  const sent = query.sent === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-950 via-slate-900 to-cyan-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{t("forgotTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("forgotSubtitle")}</p>

        {sent ? (
          <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">
            {t("forgotSent")}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {!configured ? (
          <p className="mt-6 rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-700">
            {t("forgotErrorConfig")}
          </p>
        ) : sent ? null : (
          <div className="mt-6">
            <OrganizerForgotPasswordForm
              locale={locale}
              labels={{ email: t("loginEmail"), submit: t("forgotSubmit") }}
            />
          </div>
        )}

        <Link
          href="/organizer/login"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-teal-800 hover:underline"
        >
          ← {t("forgotBackToLogin")}
        </Link>
      </div>
    </div>
  );
}
