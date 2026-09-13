import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getAdminAuth } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Locale Approval V1 shell — server-side Super Admin only (existing RBAC RPC).
 * Reuses /admin auth; does not invent a parallel auth stack.
 */
export default async function LocaleAdminGuardedLayout({ children, params }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  const session = await getAdminAuth().getSession();
  if (!session) {
    redirect(`/${locale}/admin/login?next=${encodeURIComponent(`/${locale}/admin/events`)}`);
  }
  // getSession already proves SA for supabase adapter; double-check for safety.
  const isSa = await getAdminAuth().isSuperAdmin();
  if (!isSa) {
    redirect(`/${locale}/admin/login?next=${encodeURIComponent(`/${locale}/admin/events`)}`);
  }
  return (
    <div className="min-h-[70vh] bg-platform-surface">
      <div className="border-b border-slate-200 bg-white">
        <div className="section-container flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              Super Admin
            </p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Approval V1</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/${locale}/admin/events`}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {locale === "en" ? "In review" : "İncelemede"}
            </Link>
            <Link
              href="/admin"
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Admin OS
            </Link>
          </nav>
        </div>
      </div>
      <div className="section-container py-8">{children}</div>
    </div>
  );
}
