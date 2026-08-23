import Link from "next/link";
import { IntakeStatusBadge } from "@/components/admin/IntakeStatusBadge";
import { formatDate, formatDateTime, formatDistrictLabel } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake, IntakeSource } from "@/types/admin/intake";
import type { IntakeStatus } from "@/types/admin/lifecycle";
import { INTAKE_STATUSES } from "@/types/admin/lifecycle";

const INTAKE_SOURCES: IntakeSource[] = ["SPIDER", "MANUAL", "ORGANIZER_SUBMIT"];

interface IntakeInboxProps {
  intakes: DiscoveredEventIntake[];
  currentStatus?: IntakeStatus;
  currentSource?: IntakeSource;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

function buildInboxHref(status?: IntakeStatus, source?: IntakeSource): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (source) params.set("source", source);
  const query = params.toString();
  return query ? `/admin/intake?${query}` : "/admin/intake";
}

function statusLabelKey(status: IntakeStatus): keyof AdminMessages {
  const map: Record<IntakeStatus, keyof AdminMessages> = {
    DISCOVERED: "statusDiscovered",
    AI_REVIEW: "statusAiReview",
    IMAGE_REVIEW: "statusImageReview",
    PENDING_APPROVAL: "statusPendingApproval",
    APPROVED: "statusApproved",
    REJECTED: "statusRejected",
    PUBLISHED: "statusPublished",
    SOCIAL_DISTRIBUTION: "statusSocialDistribution",
    EDIT_REVIEW: "statusEditReview",
    COMPLETED: "statusCompleted",
    ARCHIVED: "statusArchived",
  };
  return map[status];
}

export function IntakeInbox({
  intakes,
  currentStatus,
  currentSource,
  locale,
  t,
}: IntakeInboxProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/intake/new"
          className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          {t("newIntake")}
        </Link>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("filterStatus")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildInboxHref(undefined, currentSource)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              !currentStatus
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {t("filterAll")}
          </Link>
          {INTAKE_STATUSES.map((status) => (
            <Link
              key={status}
              href={buildInboxHref(status, currentSource)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                currentStatus === status
                  ? "bg-brand-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {t(statusLabelKey(status))}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("filterSource")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildInboxHref(currentStatus, undefined)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              !currentSource
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {t("filterAll")}
          </Link>
          {INTAKE_SOURCES.map((source) => (
            <Link
              key={source}
              href={buildInboxHref(currentStatus, source)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                currentSource === source
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {source}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colTitle")}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">
                {t("colDistrict")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colVenue")}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colDate")}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colSource")}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">
                {t("colStatus")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">
                {t("colCreated")}
              </th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">{t("colAction")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {intakes.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {t("noIntakes")}
                </td>
              </tr>
            ) : (
              intakes.map((intake) => (
                <tr key={intake.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {intake.rawTitle}
                    {intake.duplicateOf ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                        {t("duplicateBadge")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDistrictLabel(intake.suggestedDistrictId, locale)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{intake.suggestedVenueId ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(intake.suggestedStartsAt, locale)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{intake.source}</td>
                  <td className="px-4 py-3">
                    <IntakeStatusBadge status={intake.status} t={t} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(intake.createdAt, locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/intake/${intake.id}`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800"
                    >
                      {t("reviewAction")}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
