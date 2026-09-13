import Link from "next/link";

import { createOrganizerVenueAction } from "@/app/organizer/(app)/venues/actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import { VenueLocationMapPicker } from "@/components/organizer/VenueLocationMapPicker";
import { requireOrganizer } from "@/lib/organizer/auth";
import {
  listActiveDistrictOptions,
  VENUE_CATEGORIES,
} from "@/lib/organizer/data/venues";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

function mapCreateError(
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
    case "not_eligible":
    case "forbidden":
      return t("errNotEligible");
    case "config":
      return t("loginErrorConfig");
    default:
      return t("errVenueCreateFailed");
  }
}

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

export default async function OrganizerNewVenuePage({ searchParams }: Props) {
  await requireOrganizer();
  const locale = await resolveOrganizerLocale();
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const { error } = await searchParams;
  const errorMessage = mapCreateError(error, t);
  const districts = await listActiveDistrictOptions();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/organizer/venues"
          className="text-sm font-medium text-teal-800 hover:underline"
        >
          ← {t("venuesPageTitle")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("venueCreateTitle")}</h2>
        <p className="text-sm text-slate-600">{t("venueCreateSubtitle")}</p>
      </div>

      {errorMessage ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <form
        action={createOrganizerVenueAction}
        className="space-y-4 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm"
      >
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
            defaultValue=""
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
            defaultValue=""
          >
            <option value="">{t("fieldVenueDistrictNone")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {locale === "en" ? d.nameEn : d.nameTr}
              </option>
            ))}
          </select>
        </div>

        <VenueLocationMapPicker
          labels={{
            latitude: t("fieldVenueLatitude"),
            longitude: t("fieldVenueLongitude"),
            coordsHint: t("venueCoordsHint"),
            selectOnMap: t("venueMapSelectOnMap"),
            clearLocation: t("venueMapClearLocation"),
            locateFromAddress: t("venueMapLocateFromAddress"),
            mapUnavailable: t("venueMapUnavailable"),
            mapLoading: t("venueMapLoading"),
            mapReadyHint: t("venueMapReadyHint"),
            geocodeEmpty: t("venueMapGeocodeEmpty"),
            geocodeFailed: t("venueMapGeocodeFailed"),
          }}
        />

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
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="organization_id" className="block text-sm font-medium text-slate-500">
            {t("fieldVenueOrganization")}
          </label>
          <input
            id="organization_id"
            name="organization_id_disabled"
            type="text"
            disabled
            value=""
            placeholder={t("fieldVenueOrganizationDisabled")}
            className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-400"
          />
        </div>

        <OrganizerSubmitButton
          label={t("venueCreateSubmit")}
          pendingLabel={t("venueSaving")}
          className="w-full sm:w-auto"
        />
      </form>
    </div>
  );
}
