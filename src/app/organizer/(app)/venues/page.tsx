import Link from "next/link";

import { requireOrganizer } from "@/lib/organizer/auth";
import { listOrganizerVenues } from "@/lib/organizer/data/venues";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";

function formatUpdatedAt(iso: string, locale: "tr" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function categoryLabel(
  category: string | null,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string {
  if (!category) return "—";
  const map: Record<string, keyof ReturnType<typeof getOrganizerMessages>> = {
    hotel: "venueCatHotel",
    restaurant: "venueCatRestaurant",
    club: "venueCatClub",
    theater: "venueCatTheater",
    other: "venueCatOther",
  };
  const key = map[category];
  return key ? t(key) : category;
}


function venueStatusLabel(
  status: string,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string {
  switch (status) {
    case "draft":
      return t("venueStatusDraft");
    case "in_review":
      return t("venueStatusInReview");
    case "active":
      return t("venueStatusActive");
    default:
      return t("venueStatusInactive");
  }
}

function venueStatusClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-teal-50 text-teal-900";
    case "in_review":
      return "bg-amber-50 text-amber-950";
    case "draft":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default async function OrganizerVenuesPage() {
  const session = await requireOrganizer();
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const venues = await listOrganizerVenues(session.userId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Link href="/organizer" className="text-sm font-medium text-teal-800 hover:underline">
            ← {t("dashboard")}
          </Link>
          <h2 className="text-2xl font-bold text-slate-900">{t("venuesPageTitle")}</h2>
          <p className="text-sm text-slate-600">{t("venuesPageSubtitle")}</p>
        </div>
        <Link
          href="/organizer/venues/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          {t("newVenue")}
        </Link>
      </div>

      {venues.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          {t("venuesEmpty")}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {venues.map((venue) => (
            <li key={venue.id}>
              <Link
                href={`/organizer/venues/${venue.id}`}
                className="flex flex-col gap-2 px-4 py-3 transition hover:bg-teal-50/60 sm:flex-row sm:items-center sm:justify-between"
                data-testid="venue-list-item"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium text-slate-900">{venue.name}</p>
                  <p className="text-xs text-slate-500">
                    {[venue.city, categoryLabel(venue.venueCategory, t)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t("colUpdated")}: {formatUpdatedAt(venue.updatedAt, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${venueStatusClass(venue.status)}`}
                    data-testid="venue-status"
                  >
                    {venueStatusLabel(venue.status, t)}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      venue.eventEligible
                        ? "bg-emerald-50 text-emerald-900"
                        : "bg-amber-50 text-amber-950"
                    }`}
                    data-testid="venue-event-eligible"
                  >
                    {venue.eventEligible
                      ? t("venueEventEligibleYes")
                      : t("venueEventEligibleNo")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
