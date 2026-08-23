import {
  approveAccountApplicationFormAction,
  rejectAccountApplicationFormAction,
} from "@/lib/admin/account-application-actions";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminAccountApplicationItem } from "@/lib/admin/data/admin-account-applications";
import type { AdminMessages } from "@/lib/admin/i18n";

interface AccountApplicationQueueProps {
  applications: AdminAccountApplicationItem[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
}

export function AccountApplicationQueue({
  applications,
  locale,
  t,
}: AccountApplicationQueueProps) {
  if (applications.length === 0) {
    return <p className="text-sm text-slate-500">{t("noPendingAccountApplications")}</p>;
  }

  return (
    <div className="space-y-4">
      {applications.map((application) => (
        <article
          key={application.id}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{application.applicantLabel}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {t("accountApplicationType")}: {application.type}
              </p>
              <p className="text-sm text-slate-500">
                {t("accountApplicationApplicant")}: {application.applicantEmail ?? application.applicantId}
              </p>
              <p className="text-sm text-slate-500">
                {formatDateTime(application.submittedAt, locale)}
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {t("statusPendingApproval")}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
            <form action={approveAccountApplicationFormAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="applicationId" value={application.id} />
              <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-slate-600">
                {t("accountApplicationOrgId")}
                <input
                  name="organizationId"
                  placeholder={t("accountApplicationOrgIdPlaceholder")}
                  className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                {t("approveAccountApplication")}
              </button>
            </form>
            <form action={rejectAccountApplicationFormAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="applicationId" value={application.id} />
              <input
                name="rejectionReason"
                placeholder={t("rejectAccountApplicationReason")}
                className="min-h-10 min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
              >
                {t("rejectAccountApplication")}
              </button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
