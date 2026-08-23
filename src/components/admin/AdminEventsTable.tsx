import Link from "next/link";

import type { AdminMessages } from "@/lib/admin/i18n";
import type { AdminEventListItem } from "@/lib/admin/data/admin-events-read";

interface AdminEventsTableProps {
  events: AdminEventListItem[];
  t: (key: keyof AdminMessages) => string;
}

export function AdminEventsTable({ events, t }: AdminEventsTableProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
        {t("adminEventsEmpty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colTitle")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colStatus")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colCategory")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colDistrict")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colVenue")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colDate")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("adminEventsOwner")}</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">{t("colAction")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-900">{event.title}</td>
              <td className="px-4 py-3 capitalize text-slate-700">{event.status}</td>
              <td className="px-4 py-3 capitalize text-slate-700">{event.category}</td>
              <td className="px-4 py-3 capitalize text-slate-700">{event.district}</td>
              <td className="px-4 py-3 text-slate-700">{event.venueName}</td>
              <td className="px-4 py-3 text-slate-700">
                {new Date(event.startsAt).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-slate-700">{event.ownerLabel}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/events/${event.id}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {t("reviewAction")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
