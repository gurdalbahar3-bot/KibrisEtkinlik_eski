import Link from "next/link";

import { createOrganizerEventAction } from "@/app/organizer/(app)/events/actions";
import { requireOrganizer } from "@/lib/organizer/auth";
import { listOrganizerActiveVenues } from "@/lib/organizer/data/venues";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { CATEGORY_KEYS } from "@/lib/data/categories";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

function mapCreateError(
  error: string | undefined,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string | null {
  if (!error) return null;
  switch (error) {
    case "title_required":
      return t("errTitleRequired");
    case "venue_required":
    case "venue_forbidden":
    case "venue_not_found":
    case "venue_not_active":
      return t("errVenueRequired");
    case "category_required":
      return t("errCategoryRequired");
    case "starts_at_required":
      return t("errStartsAtRequired");
    case "ends_at_invalid":
      return t("errEndsAtInvalid");
    case "ends_before_start":
      return t("errEndsBeforeStart");
    case "not_eligible":
    case "owner_not_eligible":
      return t("errNotEligible");
    case "config":
      return t("loginErrorConfig");
    default:
      return t("errCreateFailed");
  }
}

function categoryLabel(
  key: string,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string {
  const map: Record<string, keyof ReturnType<typeof getOrganizerMessages>> = {
    concert: "catConcert",
    festival: "catFestival",
    theater: "catTheater",
    standup: "catStandup",
    nightlife: "catNightlife",
    sports: "catSports",
    family: "catFamily",
    "art-culture": "catArtCulture",
    wedding: "catWedding",
    other: "catOther",
  };
  const msgKey = map[key];
  return msgKey ? t(msgKey) : key;
}

export default async function OrganizerNewEventPage({ searchParams }: Props) {
  const session = await requireOrganizer();
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const { error } = await searchParams;
  const venues = await listOrganizerActiveVenues(session.userId);
  const errorMessage = mapCreateError(error, t);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <Link href="/organizer" className="text-sm font-medium text-teal-800 hover:underline">
          ← {t("dashboard")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("createTitle")}</h2>
        <p className="text-sm text-slate-600">{t("createSubtitle")}</p>
      </div>

      {errorMessage ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {venues.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("noActiveVenues")}
        </p>
      ) : (
        <form
          action={createOrganizerEventAction}
          className="space-y-4 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm"
        >
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-700">
              {t("fieldTitle")} *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={200}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-700">
              {t("fieldDescription")}
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={5000}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="venue_id" className="block text-sm font-medium text-slate-700">
              {t("fieldVenue")} *
            </label>
            <select
              id="venue_id"
              name="venue_id"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                {t("fieldVenuePlaceholder")}
              </option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                  {venue.city ? ` — ${venue.city}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-700">
              {t("fieldCategory")} *
            </label>
            <select
              id="category"
              name="category"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              defaultValue="concert"
            >
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key, t)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="starts_at" className="block text-sm font-medium text-slate-700">
                {t("fieldStartsAt")} *
              </label>
              <input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ends_at" className="block text-sm font-medium text-slate-700">
                {t("fieldEndsAt")}
              </label>
              <input
                id="ends_at"
                name="ends_at"
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cover" className="block text-sm font-medium text-slate-700">
              {t("fieldCover")}
            </label>
            <input
              id="cover"
              name="cover"
              type="url"
              placeholder="https://"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_free" defaultChecked className="rounded border-slate-300" />
              {t("fieldIsFree")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_wedding" className="rounded border-slate-300" />
              {t("fieldIsWedding")}
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 sm:w-auto"
          >
            {t("createSubmit")}
          </button>
        </form>
      )}
    </div>
  );
}
