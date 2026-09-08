import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { loginCustomerAction } from "@/lib/customer/auth-actions";
import { getCustomerSession } from "@/lib/customer/auth";
import { Link } from "@/lib/i18n/navigation";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function CustomerLoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error, next } = await searchParams;
  const t = await getTranslations("customerAuth");
  const session = await getCustomerSession();

  if (session) {
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      nextRedirect(next);
    }
    nextRedirect(locale === "en" ? "/en" : "/tr");
  }

  const configured = Boolean(getSupabasePublicEnv());

  let errorMessage: string | null = null;
  switch (error) {
    case "invalid":
      errorMessage = t("loginErrorInvalid");
      break;
    case "not_customer":
      errorMessage = t("loginErrorNotCustomer");
      break;
    case "missing":
      errorMessage = t("loginErrorMissing");
      break;
    case "config":
      errorMessage = t("loginErrorConfig");
      break;
    case "confirm":
      errorMessage = t("loginErrorConfirm");
      break;
    default:
      break;
  }

  return (
    <div className="section-container py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-bold text-slate-900">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("loginSubtitle")}</p>

        {errorMessage ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {configured ? (
          <form action={loginCustomerAction} className="mt-6 space-y-4" data-testid="customer-login-form">
            <input type="hidden" name="locale" value={locale} />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                {t("email")}
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
                {t("password")}
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
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              {t("loginButton")}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-slate-600">{t("loginErrorConfig")}</p>
        )}

        <p className="mt-6 text-sm text-slate-600">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            {t("signupLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
