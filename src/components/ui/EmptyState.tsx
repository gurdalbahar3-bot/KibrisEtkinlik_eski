import { useTranslations } from "next-intl";

interface EmptyStateProps {
  namespace?: "todaySection" | "featuredSection" | "weekendSection" | "upcomingSection";
}

export function EmptyState({ namespace = "todaySection" }: EmptyStateProps) {
  const t = useTranslations(namespace);

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center sm:py-16">
      <p className="text-base font-semibold text-slate-700 sm:text-lg">{t("emptyTitle")}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t("emptyHint")}</p>
    </div>
  );
}
