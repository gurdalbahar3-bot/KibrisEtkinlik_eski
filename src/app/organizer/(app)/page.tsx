import Link from "next/link";

import { requireOrganizer } from "@/lib/organizer/auth";
import { loadOrganizerDashboard } from "@/lib/organizer/data/dashboard";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { buildOrganizerPublicEventPath } from "@/lib/organizer/public-event-url";

type StatusFilter = "all" | "draft" | "in_review" | "approved" | "published";

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

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "draft" ||
    value === "in_review" ||
    value === "approved" ||
    value === "published"
  ) {
    return value;
  }
  return "all";
}

type Props = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function OrganizerDashboardPage({ searchParams }: Props) {
  const session = await requireOrganizer();
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const data = await loadOrganizerDashboard(session);
  const query = await searchParams;
  const statusFilter = parseStatusFilter(query.status);

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

  const filteredEvents =
    statusFilter === "all"
      ? data.events
      : data.events.filter((event) => event.status === statusFilter);

  const filters: { key: StatusFilter; label: string; count: number }[] = [
    {
      key: "all",
      label: t("filterAll"),
      count: data.eventCount,
    },
    {
      key: "draft",
      label: t("statusDraft"),
      count: data.statusCounts.draft,
    },
    {
      key: "in_review",
      label: t("statusInReview"),
      count: data.statusCounts.in_review,
    },
    {
      key: "approved",
      label: t("statusApproved"),
      count: data.statusCounts.approved,
    },
    {
      key: "published",
      label: t("statusPublished"),
      count: data.statusCounts.published,
    },
  ];

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
        <Link
          href="/organizer/venues"
          className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
            {t("venuesLabel")}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{data.venueCount}</p>
        </Link>
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

      <section className="flex flex-wrap gap-2" aria-label={t("filterAll")}>
        {filters.map((filter) => {
          const href =
            filter.key === "all" ? "/organizer" : `/organizer?status=${filter.key}`;
          const active = statusFilter === filter.key;
          return (
            <Link
              key={filter.key}
              href={href}
              className={
                active
                  ? "inline-flex min-h-10 items-center gap-2 rounded-full bg-teal-700 px-3.5 text-sm font-semibold text-white"
                  : "inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50/50"
              }
            >
              <span>{filter.label}</span>
              <span
                className={
                  active
                    ? "rounded-full bg-teal-600 px-1.5 text-xs"
                    : "rounded-full bg-slate-100 px-1.5 text-xs text-slate-600"
                }
              >
                {filter.count}
              </span>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-teal-950">{t("manageVenuesHint")}</p>
          <Link
            href="/organizer/venues"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-900 transition hover:bg-teal-50"
          >
            {t("manageVenues")}
          </Link>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-teal-950">{t("newEventHint")}</p>
          <Link
            href="/organizer/events/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            {t("newEvent")}
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">{t("eventsListTitle")}</h3>
        {filteredEvents.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            {t("eventsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {filteredEvents.map((event) => {
              const publicPath =
                event.status === "published"
                  ? buildOrganizerPublicEventPath(locale, event.title, event.id)
                  : null;
              return (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{event.title}</p>
                      <p className="text-xs text-slate-500">
                        {t("colStarts")}: {formatStartsAt(event.startsAt, locale)}
                      </p>
                      {event.status === "draft" ? (
                        <p className="mt-1 text-xs text-slate-600">{t("actionContinueEditing")}</p>
                      ) : null}
                      {event.status === "in_review" ? (
                        <p className="mt-1 text-xs text-amber-800">{t("waitingReview")}</p>
                      ) : null}
                      {event.status === "approved" ? (
                        <p className="mt-1 text-xs text-teal-800">{t("approvedWaitingPublish")}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex w-fit rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold capitalize text-teal-900">
                        {statusLabel(event.status)}
                      </span>
                      <Link
                        href={`/organizer/events/${event.id}`}
                        className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        {event.status === "draft"
                          ? t("actionContinueEditing")
                          : t("editTitle")}
                      </Link>
                      {publicPath ? (
                        <Link
                          href={publicPath}
                          className="inline-flex min-h-9 items-center rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                        >
                          {t("viewPublicEvent")}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
