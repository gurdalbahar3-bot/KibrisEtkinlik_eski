import Link from "next/link";
import { AdminMobileDrawer } from "@/components/admin/AdminMobileDrawer";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";
import type { AdminMessages } from "@/lib/admin/i18n";

interface AdminShellProps {
  messages: AdminMessages;
  children: React.ReactNode;
  logoutAction: () => Promise<void>;
}

export function AdminShell({ messages, children, logoutAction }: AdminShellProps) {
  const t = (key: keyof AdminMessages) => messages[key];

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-950 text-white lg:flex">
        <div className="border-b border-slate-800 px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">GED</p>
          <h1 className="mt-1 text-lg font-bold">{t("title")}</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <AdminSidebarNav />
        </div>
        <form action={logoutAction} className="border-t border-slate-800 p-3">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            {t("logout")}
          </button>
        </form>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:px-6">
          <div className="flex items-center gap-3">
            <AdminMobileDrawer
              title={t("title")}
              logoutLabel={t("logout")}
              logoutAction={logoutAction}
            />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600 lg:hidden">
                {t("title")}
              </p>
              <p className="text-sm font-semibold text-slate-900">{t("dashboard")}</p>
            </div>
          </div>
          <Link
            href="/tr"
            className="text-sm font-medium text-brand-700 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Public site ↗
          </Link>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
