import type { LifecycleTransition } from "@/types/admin/lifecycle-history";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";

interface LifecycleHistoryListProps {
  history: LifecycleTransition[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function LifecycleHistoryList({ history, locale, t }: LifecycleHistoryListProps) {
  if (history.length === 0) {
    return <p className="text-sm text-slate-500">{t("noHistory")}</p>;
  }

  return (
    <ol className="space-y-3">
      {history.map((entry) => (
        <li
          key={entry.id}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <IntakeStatusBadge status={entry.fromStatus} t={t} />
            <span className="text-slate-400">→</span>
            <IntakeStatusBadge status={entry.toStatus} t={t} />
          </div>
          <p className="mt-2 text-slate-600">
            {t("historyActor")}: {entry.actorType}
            {entry.actorId ? ` (${entry.actorId})` : ""}
          </p>
          {entry.reason ? (
            <p className="mt-1 text-slate-600">
              {t("historyReason")}: {entry.reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">
            {formatDateTime(entry.createdAt, locale)}
          </p>
        </li>
      ))}
    </ol>
  );
}
