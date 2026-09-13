import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { PublishEventPanel } from "@/components/organizer/PublishEventPanel";
import { buildDeterministicSlug } from "@/lib/data/adapters/slug";
import {
  getEventTicketSetup,
  getOrganizerEventById,
} from "@/lib/organizer/data";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

function statusMessageKey(status: string): string {
  switch (status) {
    case "published":
      return "statusPublished";
    case "approved":
      return "statusApproved";
    case "in_review":
      return "statusInReview";
    case "draft":
    default:
      return "statusDraft";
  }
}

export default async function OrganizerEventDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations("organizer");
  const tCategories = await getTranslations("categories");

  const event = await getOrganizerEventById(id);
  if (!event) notFound();

  const setup = await getEventTicketSetup(id);
  const activeZones = setup.zones.filter(
    (z) => z.is_active && z.sale_mode === "ticket_based"
  );
  const activeTypes = setup.types.filter((ty) => ty.is_active);

  const venues = event.venues as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const venueName = Array.isArray(venues)
    ? (venues[0]?.name ?? null)
    : (venues?.name ?? null);

  const publicSlug = buildDeterministicSlug(event.title, event.id);

  const statusKey = statusMessageKey(event.status);
  const statusLabel = t.has(statusKey) ? t(statusKey) : event.status;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {statusLabel}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {event.title}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {tCategories.has(event.category)
              ? tCategories(event.category)
              : event.category}
            {venueName ? ` · ${venueName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={{
              pathname: "/organizer/events/[id]/tickets",
              params: { id: event.id },
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800"
          >
            {t("manageTickets")}
          </Link>
          {event.status === "published" ? (
            <Link
              href={{
                pathname: "/events/[slug]",
                params: { slug: publicSlug },
              }}
              className="btn-primary"
            >
              {t("viewPublicEvent")}
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("fieldStartsAt")}
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {new Date(event.starts_at).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("fieldEndsAt")}
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {event.ends_at ? new Date(event.ends_at).toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("fieldIsFree")}
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {event.is_free ? t("isFreeYes") : t("isFreeNo")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("ticketsSummary")}
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {t("ticketsSummaryValue", {
              zones: activeZones.length,
              types: activeTypes.length,
            })}
          </dd>
        </div>
      </dl>

      {event.description ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">{t("fieldDescription")}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
            {event.description}
          </p>
        </div>
      ) : null}

      {event.status === "draft" || event.status === "in_review" ? (
        <PublishEventPanel eventId={event.id} publicSlug={publicSlug} />
      ) : null}

      {event.status === "approved" ? (
        <p className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {t("approvedWaitingPublish")}
        </p>
      ) : null}
    </div>
  );
}
