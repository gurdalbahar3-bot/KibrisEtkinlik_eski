import type { PublishChecklistItem } from "@/lib/admin/publishing/publish-checklist";
import type { AdminMessages } from "@/lib/admin/i18n";

interface PublishChecklistProps {
  items: PublishChecklistItem[];
  t: (key: keyof AdminMessages) => string;
}

export function PublishChecklist({ items, t }: PublishChecklistProps) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
              item.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
            }`}
          >
            {item.passed ? "✓" : "✗"}
          </span>
          <span className={item.passed ? "text-slate-700" : "text-red-700"}>{t(item.labelKey)}</span>
        </li>
      ))}
    </ul>
  );
}
