import Link from "next/link";

import { requireOrganizer } from "@/lib/organizer/auth";
import { loadOrganizerDashboard } from "@/lib/organizer/data/dashboard";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";

function formatStartsAt(iso: string, locale: "tr" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function OrganizerDashboardPage() {
  const session = await requireOrganizer();
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const data = await loadOrganizerDashboard(session);

  const displayName = session.fullName?.trim() || session.email || "Organizer";
  const statusLabel = (status: string) => {
    switch (status) {
      case "draft":
        return t("statusDraft");
      case "in_review":
        return t("statusInReview");
      case "approved":
        return t("statusApproved");
      case "published":
        return t("statusPublished");
      default:
        return status;
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {t("welcome")}, {displayName}
        </h2>
        {session.verificationStatus !== "approved" ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            {t("verificationPending")}
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {t("organizationLabel")}
          </p>
          {data.organization ? (
            <p className="mt-2 text-lg font-semibold text-slate-900">{data.organization.name}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{t("noOrganization")}</p>
          )}
        </div>
        <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {t("venuesLabel")}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{data.venueCount}</p>
        </div>
        <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {t("eventsLabel")}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{data.eventCount}</p>
        </div>
        <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t("profileLabel")}</p>
          <p className="mt-2 truncate text-sm font-medium text-slate-800">
            {session.email ?? session.userId}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["statusDraft", data.statusCounts.draft],
            ["statusInReview", data.statusCounts.in_review],
            ["statusApproved", data.statusCounts.approved],
            ["statusPublished", data.statusCounts.published],
          ] as const
        ).map(([key, count]) => (
          <div
            key={key}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{t(key)}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-teal-950">{t("newEventHint")}</p>
        <Link
          href="/organizer/events/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          {t("newEvent")}
        </Link>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">{t("eventsListTitle")}</h3>
        {data.events.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            {t("eventsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {data.events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/organizer/events/${event.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition hover:bg-teal-50/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{event.title}</p>
                    <p className="text-xs text-slate-500">
                      {t("colStarts")}: {formatStartsAt(event.startsAt, locale)}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold capitalize text-teal-900">
                    {statusLabel(event.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
