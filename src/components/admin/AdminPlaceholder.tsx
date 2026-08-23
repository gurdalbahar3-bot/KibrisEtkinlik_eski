import Link from "next/link";
import type { AdminMessages } from "@/lib/admin/i18n";

interface AdminPlaceholderProps {
  title: string;
  t: (key: keyof AdminMessages) => string;
}

export function AdminPlaceholder({ title, t }: AdminPlaceholderProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t("pending")}</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600">{t("placeholderBody")}</p>
      <p className="mt-4 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
        {t("mockData")}
      </p>
      <div className="mt-6">
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          ← {t("dashboard")}
        </Link>
      </div>
    </div>
  );
}
