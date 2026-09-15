import Link from "next/link";

import type { OrganizerMessages } from "@/lib/organizer/i18n";

interface OrganizerShellProps {
  messages: OrganizerMessages;
  children: React.ReactNode;
  logoutAction: () => Promise<void>;
  displayName: string;
}

export function OrganizerShell({
  messages,
  children,
  logoutAction,
  displayName,
}: OrganizerShellProps) {
  const t = (key: keyof OrganizerMessages) => messages[key];

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-slate-50 to-white">
      <header className="sticky top-0 z-30 border-b border-teal-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
              {t("brand")}
            </p>
            <h1 className="truncate text-lg font-bold text-slate-900">{t("productName")}</h1>
            <p className="truncate text-sm text-slate-600">{displayName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/tr"
              className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 sm:inline-flex"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("publicSite")} ↗
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-900 transition hover:bg-teal-50"
              >
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
