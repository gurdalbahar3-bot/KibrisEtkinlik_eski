import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deactivateOrganizerVenueAction,
  submitOrganizerVenueForReviewAction,
  updateOrganizerVenueAction,
} from "@/app/organizer/(app)/venues/actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import { requireOrganizer } from "@/lib/organizer/auth";
import {
  getOrganizerVenue,
  listActiveDistrictOptions,
  VENUE_CATEGORIES,
} from "@/lib/organizer/data/venues";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { isVenueUuid } from "@/lib/organizer/rpc";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    created?: string;
    saved?: string;
    deactivated?: string;
    submitted?: string;
  }>;
};

function categoryLabel(
  key: string,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string {
  const map: Record<string, keyof ReturnType<typeof getOrganizerMessages>> = {
    hotel: "venueCatHotel",
    restaurant: "venueCatRestaurant",
    club: "venueCatClub",
    theater: "venueCatTheater",
    other: "venueCatOther",
  };
  const msgKey = map[key];
  return msgKey ? t(msgKey) : key;
}

function mapEditError(
  error: string | undefined,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string | null {
  if (!error) return null;
  switch (error) {
    case "name_required":
      return t("errVenueNameRequired");
    case "invalid_venue_category":
      return t("errVenueCategoryInvalid");
    case "invalid_district":
      return t("errVenueDistrictInvalid");
    case "invalid_coordinates":
      return t("errVenueCoordinatesInvalid");
    case "invalid_capacity":
      return t("errVenueCapacityInvalid");
    case "forbidden":
      return t("errForbidden");
    case "venue_not_found":
      return t("errVenueNotFound");
    default:
      return t("errVenueUpdateFailed");
  }
}

function formatDateTime(iso: string, locale: "tr" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function OrganizerVenueDetailPage({ params, searchParams }: Props) {
  await requireOrganizer();
  const { id } = await params;
  const query = await searchParams;

  if (!isVenueUuid(id)) {
    notFound();
  }

  const venue = await getOrganizerVenue(id);
  if (!venue) {
    notFound();
  }

  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const districts = await listActiveDistrictOptions();
  const errorMessage = mapEditError(query.error, t);
  const isActive = venue.status === "active";
  const isDraft = venue.status === "draft";
  const isInReview = venue.status === "in_review";

  function statusLabel(status: string): string {
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

  let successMessage: string | null = null;
  if (query.created === "1") successMessage = t("msgVenueCreated");
  else if (query.saved === "1") successMessage = t("msgVenueSaved");
  else if (query.deactivated === "1") successMessage = t("msgVenueDeactivated");
  else if (query.submitted === "1") successMessage = t("msgVenueSubmitted");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/organizer/venues"
          className="text-sm font-medium text-teal-800 hover:underline"
        >
          ← {t("venuesPageTitle")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold text-slate-900">{t("venueDetailTitle")}</h2>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              isActive
                ? "bg-teal-50 text-teal-900"
                : isInReview
                  ? "bg-amber-50 text-amber-950"
                  : "bg-slate-100 text-slate-700"
            }`}
            data-testid="venue-detail-status"
          >
            {statusLabel(venue.status)}
          </span>
        </div>
        <p className="text-sm text-slate-600">{t("venueDetailSubtitle")}</p>
      </div>

      {successMessage ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("fieldVenueId")}
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-slate-800">{venue.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("colStatus")}
          </dt>
          <dd className="mt-1 font-medium text-slate-900" data-testid="venue-status-value">
            {statusLabel(venue.status)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("colCreated")}
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {formatDateTime(venue.createdAt, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("colUpdated")}
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {formatDateTime(venue.updatedAt, locale)}
          </dd>
        </div>
      </dl>

      {isDraft ? (
        <form
          action={submitOrganizerVenueForReviewAction}
          className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/60 p-4"
          data-testid="venue-submit-for-review"
        >
          <input type="hidden" name="venue_id" value={venue.id} />
          <p className="text-sm text-teal-950">{t("venueSubmitForReviewHint")}</p>
          <div className="mt-3">
            <OrganizerSubmitButton
              label={t("venueSubmitForReview")}
              pendingLabel={t("venueSaving")}
            />
          </div>
        </form>
      ) : null}

      {isInReview ? (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="venue-awaiting-review"
          role="status"
        >
          {t("venueAwaitingReview")}
        </p>
      ) : null}

      {isActive ? (
        <form
          action={deactivateOrganizerVenueAction}
          className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-4"
        >
          <input type="hidden" name="venue_id" value={venue.id} />
          <p className="text-sm text-amber-950">{t("venueDeactivateHint")}</p>
          <div className="mt-3">
            <OrganizerSubmitButton
              label={t("venueDeactivate")}
              pendingLabel={t("venueSaving")}
              variant="danger"
            />
          </div>
        </form>
      ) : null}

      <form
        action={updateOrganizerVenueAction}
        className="space-y-4 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="venue_id" value={venue.id} />

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700">
            {t("fieldVenueName")} *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={200}
            defaultValue={venue.name}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="venue_category" className="block text-sm font-medium text-slate-700">
            {t("fieldVenueCategory")}
          </label>
          <select
            id="venue_category"
            name="venue_category"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            defaultValue={venue.venueCategory ?? ""}
          >
            <option value="">{t("fieldVenueCategoryNone")}</option>
            {VENUE_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {categoryLabel(key, t)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-slate-700">
            {t("fieldVenueAddress")}
          </label>
          <input
            id="address"
            name="address"
            type="text"
            maxLength={500}
            defaultValue={venue.address ?? ""}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-slate-700">
              {t("fieldVenueCity")}
            </label>
            <input
              id="city"
              name="city"
              type="text"
              maxLength={120}
              defaultValue={venue.city ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="region" className="block text-sm font-medium text-slate-700">
              {t("fieldVenueRegion")}
            </label>
            <input
              id="region"
              name="region"
              type="text"
              maxLength={120}
              defaultValue={venue.region ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="district_id" className="block text-sm font-medium text-slate-700">
            {t("fieldVenueDistrict")}
          </label>
          <select
            id="district_id"
            name="district_id"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            defaultValue={venue.districtId ?? ""}
          >
            <option value="">{t("fieldVenueDistrictNone")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {locale === "en" ? d.nameEn : d.nameTr}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="latitude" className="block text-sm font-medium text-slate-700">
              {t("fieldVenueLatitude")}
            </label>
            <input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              defaultValue={venue.latitude ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="longitude" className="block text-sm font-medium text-slate-700">
              {t("fieldVenueLongitude")}
            </label>
            <input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              defaultValue={venue.longitude ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">{t("venueCoordsHint")}</p>

        <div>
          <label htmlFor="capacity" className="block text-sm font-medium text-slate-700">
            {t("fieldVenueCapacity")}
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            step={1}
            defaultValue={venue.capacity ?? ""}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="floor_plan_url" className="block text-sm font-medium text-slate-700">
            {t("fieldVenueFloorPlan")}
          </label>
          <input
            id="floor_plan_url"
            name="floor_plan_url"
            type="url"
            placeholder="https://"
            defaultValue={venue.floorPlanUrl ?? ""}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <OrganizerSubmitButton
          label={t("venueSave")}
          pendingLabel={t("venueSaving")}
          variant="secondary"
        />
      </form>
    </div>
  );
}
