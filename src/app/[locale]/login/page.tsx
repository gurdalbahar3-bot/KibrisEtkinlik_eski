import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect as nextRedirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { getCustomerSession } from "@/lib/customer/auth";
import {
  customerHomePath,
  safeCustomerNextPath,
} from "@/lib/auth/safe-next";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
};

export default async function CustomerLoginPage({ params, searchParams }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  setRequestLocale(locale);

  const query = await searchParams;
  const nextPath = safeCustomerNextPath(query.next, locale);
  const home = customerHomePath(locale);

  const session = await getCustomerSession();
  if (session) {
    nextRedirect(nextPath ?? home);
  }

  const t = await getTranslations("auth");

  let errorMessage: string | null = null;
  switch (query.error) {
    case "missing":
      errorMessage = t("errorMissing");
      break;
    case "invalid":
      errorMessage = t("errorInvalid");
      break;
    case "not_customer":
      errorMessage = t("errorNotCustomer");
      break;
    case "config":
      errorMessage = t("errorConfig");
      break;
    case "confirm":
      errorMessage = t("errorConfirm");
      break;
    case "auth_callback":
      errorMessage = t("callbackError");
      break;
    default:
      if (query.error) errorMessage = t("callbackError");
      break;
  }

  const resetSuccess = query.reset === "1" ? t("resetSuccess") : null;

  return (
    <section className="section-container py-12 sm:py-16">
      <div className="mx-auto mb-8 max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      </div>
      {resetSuccess ? (
        <p
          className="mx-auto mb-4 max-w-md rounded-lg bg-teal-50 px-3 py-2 text-center text-sm text-teal-900"
          role="status"
        >
          {resetSuccess}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="mx-auto mb-4 max-w-md rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      <LoginForm locale={locale} nextPath={nextPath ?? ""} />
      <p className="mx-auto mt-6 max-w-md text-center text-sm text-slate-600">
        {t("noAccount")}{" "}
        {nextPath ? (
          <Link
            href={{ pathname: "/signup", query: { next: nextPath } }}
            className="font-medium text-brand-700 hover:underline"
          >
            {t("signupLink")}
          </Link>
        ) : (
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            {t("signupLink")}
          </Link>
        )}
      </p>
    </section>
  );
}
