import type { OrumcekStatus } from "@/lib/orumcek/types";
import type { AdminMessages } from "@/lib/admin/i18n";

const STATUS_STYLES: Record<OrumcekStatus, string> = {
  DISCOVERED: "bg-sky-100 text-sky-800",
  AI_DRAFT: "bg-violet-100 text-violet-800",
  REVIEW: "bg-orange-100 text-orange-900",
  PENDING_APPROVAL: "bg-amber-100 text-amber-900",
  APPROVED_READY: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
};

const STATUS_LABEL_KEYS: Record<OrumcekStatus, keyof AdminMessages> = {
  DISCOVERED: "orumcekStatusDiscovered",
  AI_DRAFT: "orumcekStatusAiDraft",
  REVIEW: "orumcekStatusReview",
  PENDING_APPROVAL: "orumcekStatusPendingApproval",
  APPROVED_READY: "orumcekStatusApprovedReady",
  REJECTED: "orumcekStatusRejected",
};

interface OrumcekStatusBadgeProps {
  status: OrumcekStatus;
  t: (key: keyof AdminMessages) => string;
}

export function OrumcekStatusBadge({ status, t }: OrumcekStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}
