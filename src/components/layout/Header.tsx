"use client";

import { FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import NextLink from "next/link";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";

const NAV_ITEMS = [
  { key: "events", href: "/events" as const },
  { key: "venues", href: "/venues" as const },
  { key: "categories", href: "/categories" as const },
  { key: "districts", href: "/districts" as const },
] as const;

export function Header() {
  const t = useTranslations("nav");
  const tMeta = useTranslations("meta");
  const tListing = useTranslations("listing");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const switchLocale = locale === "tr" ? "en" : "tr";

  function handleLocaleSwitch() {
    router.replace(
      { pathname, params } as { pathname: "/" },
      { locale: switchLocale }
    );
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    router.push({
      pathname: "/events",
      query: query.trim() ? { q: query.trim() } : {},
    });
    setSearchOpen(false);
    setMobileOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="section-container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 shrink items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-sm">
            K
          </span>
          <span className="truncate text-sm font-semibold text-slate-900 md:hidden">
            {tMeta("siteNameShort")}
          </span>
          <span className="hidden font-semibold text-slate-900 md:block">
            {tMeta("siteName")}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {searchOpen ? (
            <form onSubmit={onSearchSubmit} className="hidden sm:flex">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tListing("searchPlaceholder")}
                className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm lg:w-56"
                autoFocus
              />
            </form>
          ) : (
            <button
              type="button"
              className="hidden rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-brand-300 hover:text-brand-700 sm:inline-flex"
              aria-label={t("search")}
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </button>
          )}

          <button
            type="button"
            onClick={handleLocaleSwitch}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
          >
            {switchLocale}
          </button>

          <Link
            href="/account/orders"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
          >
            {t("orders")}
          </Link>
          <Link
            href="/login"
            className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700 sm:inline-flex"
          >
            {t("login")}
          </Link>
          <NextLink
            href="/organizer/login"
            className="hidden text-xs font-medium text-slate-600 underline-offset-2 transition hover:text-slate-900 hover:underline sm:inline"
            data-testid="organizer-login-link"
          >
            {t("organizerLogin")}
          </NextLink>

          <button
            type="button"
            className="inline-flex rounded-lg p-2 text-slate-700 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? t("close") : t("menu")}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-slate-200 bg-white px-4 py-4 md:hidden" aria-label="Mobile">
          <form onSubmit={onSearchSubmit} className="mb-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tListing("searchPlaceholder")}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            />
          </form>
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setMobileOpen(false)}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/account/orders"
                className="block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
              >
                {t("orders")}
              </Link>
            </li>
            <li>
              <Link
                href="/login"
                className="block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
              >
                {t("login")}
              </Link>
            </li>
            <li>
              <NextLink
                href="/organizer/login"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setMobileOpen(false)}
              >
                {t("organizerLogin")}
              </NextLink>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
