import { getTranslations, setRequestLocale } from "next-intl/server";

import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (user) {
    redirect({ href: "/organizer", locale });
  }

  const t = await getTranslations("auth");
  const nextPath = query.next?.startsWith(`/${locale}/organizer`)
    ? query.next
    : `/${locale}/organizer`;

  return (
    <section className="section-container py-12 sm:py-16">
      <div className="mx-auto mb-8 max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      </div>
      {query.error ? (
        <p className="mx-auto mb-4 max-w-md rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">
          {t("callbackError")}
        </p>
      ) : null}
      <LoginForm locale={locale} nextPath={nextPath} />
    </section>
  );
}
