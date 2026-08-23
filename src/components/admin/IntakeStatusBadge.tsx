import type { IntakeStatus } from "@/types/admin/lifecycle";
import { STATUS_LABEL_KEYS } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";

const STATUS_STYLES: Record<IntakeStatus, string> = {
  DISCOVERED: "bg-sky-100 text-sky-800",
  AI_REVIEW: "bg-violet-100 text-violet-800",
  IMAGE_REVIEW: "bg-indigo-100 text-indigo-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  PUBLISHED: "bg-brand-100 text-brand-800",
  SOCIAL_DISTRIBUTION: "bg-teal-100 text-teal-800",
  EDIT_REVIEW: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-slate-200 text-slate-800",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

interface IntakeStatusBadgeProps {
  status: IntakeStatus;
  t: (key: keyof AdminMessages) => string;
}

export function IntakeStatusBadge({ status, t }: IntakeStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}
