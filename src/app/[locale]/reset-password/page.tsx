import { getTranslations, setRequestLocale } from "next-intl/server";
import NextLink from "next/link";
import { Link } from "@/lib/i18n/navigation";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import {
  customerPasswordResetReturnTo,
  isSafePasswordResetReturnTo,
  organizerPasswordResetReturnTo,
} from "@/lib/auth/password-recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations("passwordReset");
  const configured = Boolean(getSupabasePublicEnv());
  const returnTo = isSafePasswordResetReturnTo(query.returnTo)
    ? query.returnTo
    : customerPasswordResetReturnTo(locale);
  const organizerReturn = returnTo === organizerPasswordResetReturnTo();

  let hasSession = false;
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    hasSession = Boolean(user);
  }

  let errorMessage: string | null = null;
  switch (query.error) {
    case "missing":
      errorMessage = t("errorMissing");
      break;
    case "weak":
      errorMessage = t("errorWeak");
      break;
    case "mismatch":
      errorMessage = t("errorMismatch");
      break;
    case "session":
    case "recovery":
      errorMessage = t("errorSession");
      break;
    case "update":
      errorMessage = t("errorUpdate");
      break;
    case "config":
      errorMessage = t("errorConfig");
      break;
    default:
      break;
  }

  return (
    <section className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      </div>

      {errorMessage ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-lg bg-slate-100 px-3 py-3 text-center text-sm text-slate-700">
          {t("errorConfig")}
        </p>
      ) : hasSession ? (
        <ResetPasswordForm locale={locale} returnTo={returnTo} />
      ) : (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-700">{t("errorSession")}</p>
          <p className="text-xs text-slate-500">{t("sessionHint")}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {organizerReturn ? (
              <NextLink
                href="/organizer/login"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-teal-200 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50"
              >
                {t("organizerLogin")}
              </NextLink>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {t("customerLogin")}
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
