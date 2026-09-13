import type { ReactNode } from "react";
import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { loadOrganizerContext } from "@/lib/auth/require-organizer";
import { logoutAction } from "./actions";

type Props = { children: ReactNode };

export default async function OrganizerLayout({ children }: Props) {
  const locale = await getLocale();
  const t = await getTranslations("organizer");
  const ctx = await loadOrganizerContext();

  if (ctx.status === "unauthenticated") {
    // Organizer OS uses dedicated /organizer/login — never customer /giris.
    redirect("/organizer/login");
  }

  if (ctx.status === "forbidden") {
    return (
      <div className="section-container py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("accessDeniedTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{t("accessDeniedBody")}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/"
            className="btn-primary"
          >
            {t("backHome")}
          </Link>
          <NextLink
            href="/organizer/login"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800"
          >
            {t("switchAccount")}
          </NextLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-platform-surface">
      <div className="border-b border-slate-200 bg-white">
        <div className="section-container flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              {t("badge")}
            </p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {t("navTitle")}
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/organizer"
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {t("navDashboard")}
            </Link>
            <Link
              href="/organizer/events"
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {t("navEvents")}
            </Link>
            <Link
              href="/organizer/events/new"
              className="rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white hover:bg-brand-800"
            >
              {t("navNewEvent")}
            </Link>
            <form action={logoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {t("logout")}
              </button>
            </form>
          </nav>
        </div>
      </div>
      <div className="section-container py-8">{children}</div>
    </div>
  );
}
