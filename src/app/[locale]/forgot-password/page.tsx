import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ params, searchParams }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations("forgotPassword");
  const configured = Boolean(getSupabasePublicEnv());

  let errorMessage: string | null = null;
  switch (query.error) {
    case "missing":
      errorMessage = t("errorMissing");
      break;
    case "send":
      errorMessage = t("errorSend");
      break;
    case "config":
      errorMessage = t("errorConfig");
      break;
    default:
      break;
  }

  const sent = query.sent === "1";

  return (
    <section className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      </div>

      {sent ? (
        <p
          className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-center text-sm text-teal-900"
          role="status"
        >
          {t("sent")}
        </p>
      ) : null}

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
      ) : sent ? null : (
        <ForgotPasswordForm locale={locale} />
      )}

      <p className="mx-auto mt-6 max-w-md text-center text-sm text-slate-600">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </section>
  );
}
