import Link from "next/link";
import { redirect } from "next/navigation";

import { loginDevAction, loginSupabaseAction } from "@/app/admin/login/actions";
import { AdminImagePolicyBanner } from "@/components/admin/AdminImagePolicyBanner";
import { getAdminAuth } from "@/lib/admin/auth";
import { shouldUseDevAdminAuth } from "@/lib/admin/auth/should-use-dev-admin-auth";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

function loginErrorMessage(
  t: (key: keyof ReturnType<typeof getAdminMessages>) => string,
  error?: string
): string | null {
  switch (error) {
    case "invalid":
      return t("loginErrorInvalid");
    case "not_super_admin":
      return t("loginErrorNotSuperAdmin");
    case "missing":
      return t("loginErrorMissing");
    case "config":
      return t("loginErrorConfig");
    default:
      return null;
  }
}

export default async function AdminLoginPage({ searchParams }: Props) {
  const auth = getAdminAuth();
  const session = await auth.getSession();
  if (session) {
    redirect("/admin");
  }

  const { error } = await searchParams;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const showDevLogin = shouldUseDevAdminAuth();
  const showSupabaseLogin = Boolean(getSupabasePublicEnv()) && !showDevLogin;
  const errorMessage = loginErrorMessage(t, error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">GED</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{t("loginTitle")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("loginSubtitle")}</p>

          {errorMessage ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {errorMessage}
            </p>
          ) : null}

          {showDevLogin ? (
            <>
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t("loginDevOnly")}
              </p>
              <form action={loginDevAction} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  {t("loginButton")}
                </button>
              </form>
            </>
          ) : null}

          {showSupabaseLogin ? (
            <>
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {t("loginSupabaseHint")}
              </p>
              <form action={loginSupabaseAction} className="mt-6 space-y-4">
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
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  {t("loginSupabaseButton")}
                </button>
              </form>
            </>
          ) : null}

          {!showDevLogin && !showSupabaseLogin ? (
            <p className="mt-6 rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-700">
              {t("loginProductionBlocked")}
            </p>
          ) : null}

          <Link
            href="/tr"
            className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline"
          >
            ← Public site
          </Link>
        </div>

        <AdminImagePolicyBanner t={t} />
      </div>
    </div>
  );
}
