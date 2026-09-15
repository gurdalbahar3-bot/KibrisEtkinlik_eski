import {
  deleteOrganizerEventFormatAction,
  deleteOrganizerEventLocationAction,
  deleteOrganizerEventVenueContactAction,
  deleteOrganizerEventWeddingDetailsAction,
  upsertOrganizerEventFormatAction,
  upsertOrganizerEventLocationAction,
  upsertOrganizerEventVenueContactAction,
  upsertOrganizerEventWeddingDetailsAction,
} from "@/app/organizer/(app)/events/actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import type {
  OrganizerEventFormat,
  OrganizerEventLocation,
  OrganizerEventMetadataBundle,
  OrganizerEventVenueContact,
  OrganizerWeddingDetails,
} from "@/lib/organizer/data/event-metadata";
import type { OrganizerDistrictOption } from "@/lib/organizer/data/venues";
import type { OrganizerMessages } from "@/lib/organizer/i18n";
import { EVENT_FORMAT_TYPES } from "@/lib/organizer/rpc";

type TFn = (key: keyof OrganizerMessages) => string;

type Props = {
  eventId: string;
  venueId: string;
  venueName: string | null;
  isWedding: boolean;
  isDraft: boolean;
  locale: "tr" | "en";
  metadata: OrganizerEventMetadataBundle;
  districts: OrganizerDistrictOption[];
  t: TFn;
  metaOk: string | null;
  metaError: string | null;
  metaSection: string | null;
};

function formatTypeLabel(type: string, t: TFn): string {
  switch (type) {
    case "general_admission":
      return t("formatGeneralAdmission");
    case "seated":
      return t("formatSeated");
    case "table_reservation":
      return t("formatTableReservation");
    default:
      return type;
  }
}

function districtLabel(
  district: OrganizerDistrictOption,
  locale: "tr" | "en"
): string {
  return locale === "en" ? district.nameEn : district.nameTr;
}

function mapMetaError(error: string | null, t: TFn): string | null {
  if (!error) return null;
  switch (error) {
    case "not_draft":
      return t("errMetaNotDraft");
    case "not_found":
    case "event_not_found":
      return t("errEventNotFound");
    case "forbidden":
      return t("errForbidden");
    case "invalid_format_type":
      return t("errMetaInvalidFormat");
    case "duplicate_format_type":
      return t("errMetaDuplicateFormat");
    case "format_not_found":
      return t("errMetaFormatNotFound");
    case "invalid_coordinates":
      return t("errMetaInvalidCoordinates");
    case "invalid_district":
      return t("errMetaInvalidDistrict");
    case "location_not_found":
      return t("errMetaLocationNotFound");
    case "contact_name_required":
      return t("errMetaContactNameRequired");
    case "contact_phone_required":
      return t("errMetaContactPhoneRequired");
    case "contact_not_found":
      return t("errMetaContactNotFound");
    case "venue_name_required":
    case "venue_not_found":
    case "venue_event_mismatch":
      return t("errMetaVenueContactFailed");
    case "not_wedding_event":
      return t("errMetaNotWeddingEvent");
    case "bride_name_required":
      return t("errMetaBrideRequired");
    case "groom_name_required":
      return t("errMetaGroomRequired");
    case "wedding_details_not_found":
      return t("errMetaWeddingNotFound");
    default:
      return t("errMetaMutationFailed");
  }
}

function mapMetaOk(meta: string | null, t: TFn): string | null {
  if (!meta) return null;
  switch (meta) {
    case "format_saved":
      return t("msgMetaFormatSaved");
    case "format_deleted":
      return t("msgMetaFormatDeleted");
    case "location_saved":
      return t("msgMetaLocationSaved");
    case "location_deleted":
      return t("msgMetaLocationDeleted");
    case "contact_saved":
      return t("msgMetaContactSaved");
    case "contact_deleted":
      return t("msgMetaContactDeleted");
    case "wedding_saved":
      return t("msgMetaWeddingSaved");
    case "wedding_deleted":
      return t("msgMetaWeddingDeleted");
    default:
      return null;
  }
}

function sectionFeedback(
  section: string,
  metaOk: string | null,
  metaError: string | null,
  metaSection: string | null,
  t: TFn
): { ok: string | null; error: string | null } {
  const okPrefixes: Record<string, string[]> = {
    format: ["format_saved", "format_deleted"],
    location: ["location_saved", "location_deleted"],
    contact: ["contact_saved", "contact_deleted"],
    wedding: ["wedding_saved", "wedding_deleted"],
  };
  const ok =
    metaOk && okPrefixes[section]?.includes(metaOk) ? mapMetaOk(metaOk, t) : null;
  const error =
    metaSection === section ? mapMetaError(metaError, t) : null;
  return { ok, error };
}

function Feedback({ ok, error }: { ok: string | null; error: string | null }) {
  return (
    <>
      {ok ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function FormatSection({
  eventId,
  isDraft,
  formats,
  t,
  feedback,
}: {
  eventId: string;
  isDraft: boolean;
  formats: OrganizerEventFormat[];
  t: TFn;
  feedback: { ok: string | null; error: string | null };
}) {
  const used = new Set(formats.map((f) => f.formatType));
  const available = EVENT_FORMAT_TYPES.filter((type) => !used.has(type));

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="meta-format-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{t("metaFormatTitle")}</h3>
        <p className="text-sm text-slate-600">{t("metaFormatSubtitle")}</p>
      </div>
      <Feedback ok={feedback.ok} error={feedback.error} />

      {formats.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="meta-format-empty">
          {t("metaFormatEmpty")}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="meta-format-list">
          {formats.map((format) => (
            <li
              key={format.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              data-testid="meta-format-item"
              data-format-type={format.formatType}
            >
              <span className="font-medium text-slate-900">
                {formatTypeLabel(format.formatType, t)}
              </span>
              {isDraft ? (
                <form action={deleteOrganizerEventFormatAction}>
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="format_id" value={format.id} />
                  <OrganizerSubmitButton
                    label={t("metaDelete")}
                    pendingLabel={t("metaDeleting")}
                    variant="danger"
                    className="min-h-9 px-3 text-xs"
                  />
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isDraft ? (
        available.length > 0 ? (
          <form
            action={upsertOrganizerEventFormatAction}
            className="space-y-3 border-t border-slate-100 pt-3"
            data-testid="meta-format-add"
          >
            <input type="hidden" name="event_id" value={eventId} />
            <div>
              <label htmlFor="format_type" className="block text-sm font-medium text-slate-700">
                {t("metaAddFormat")}
              </label>
              <select
                id="format_type"
                name="format_type"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  {t("metaFormatPlaceholder")}
                </option>
                {available.map((type) => (
                  <option key={type} value={type}>
                    {formatTypeLabel(type, t)}
                  </option>
                ))}
              </select>
            </div>
            <OrganizerSubmitButton
              label={t("metaSaveFormat")}
              pendingLabel={t("metaSaving")}
              variant="secondary"
            />
          </form>
        ) : (
          <p className="text-xs text-slate-500">{t("metaFormatAllAdded")}</p>
        )
      ) : (
        <p className="text-xs text-slate-500">{t("metaReadOnlyHint")}</p>
      )}
    </section>
  );
}

function LocationSection({
  eventId,
  isDraft,
  locale,
  location,
  districts,
  t,
  feedback,
}: {
  eventId: string;
  isDraft: boolean;
  locale: "tr" | "en";
  location: OrganizerEventLocation | null;
  districts: OrganizerDistrictOption[];
  t: TFn;
  feedback: { ok: string | null; error: string | null };
}) {
  const districtName =
    location?.districtId != null
      ? districts.find((d) => d.id === location.districtId)
      : null;

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="meta-location-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{t("metaLocationTitle")}</h3>
        <p className="text-sm text-slate-600">{t("metaLocationSubtitle")}</p>
      </div>
      <Feedback ok={feedback.ok} error={feedback.error} />

      {isDraft ? (
        <>
          <form
            action={upsertOrganizerEventLocationAction}
            className="space-y-3"
            data-testid="meta-location-form"
          >
            <input type="hidden" name="event_id" value={eventId} />
            <div>
              <label htmlFor="district_id" className="block text-sm font-medium text-slate-700">
                {t("fieldVenueDistrict")}
              </label>
              <select
                id="district_id"
                name="district_id"
                defaultValue={location?.districtId ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">{t("fieldVenueDistrictNone")}</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {districtLabel(d, locale)}
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
                defaultValue={location?.address ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-slate-700">
                  {t("fieldVenueCity")}
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  defaultValue={location?.city ?? ""}
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
                  defaultValue={location?.region ?? ""}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="directions_text"
                className="block text-sm font-medium text-slate-700"
              >
                {t("metaDirections")}
              </label>
              <textarea
                id="directions_text"
                name="directions_text"
                rows={2}
                defaultValue={location?.directionsText ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="latitude" className="block text-sm font-medium text-slate-700">
                  {t("fieldVenueLatitude")}
                </label>
                <input
                  id="latitude"
                  name="latitude"
                  type="text"
                  inputMode="decimal"
                  defaultValue={location?.latitude ?? ""}
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
                  type="text"
                  inputMode="decimal"
                  defaultValue={location?.longitude ?? ""}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">{t("venueCoordsHint")}</p>
            <OrganizerSubmitButton
              label={t("metaSaveLocation")}
              pendingLabel={t("metaSaving")}
              variant="secondary"
            />
          </form>
          {location ? (
            <form action={deleteOrganizerEventLocationAction} data-testid="meta-location-delete">
              <input type="hidden" name="event_id" value={eventId} />
              <OrganizerSubmitButton
                label={t("metaDeleteLocation")}
                pendingLabel={t("metaDeleting")}
                variant="danger"
              />
            </form>
          ) : null}
        </>
      ) : location ? (
        <dl className="grid gap-2 text-sm" data-testid="meta-location-readonly">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("fieldVenueDistrict")}
            </dt>
            <dd className="text-slate-900">
              {districtName ? districtLabel(districtName, locale) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("fieldVenueAddress")}
            </dt>
            <dd className="text-slate-900">{location.address || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("fieldVenueCity")}
            </dt>
            <dd className="text-slate-900">{location.city || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("fieldVenueRegion")}
            </dt>
            <dd className="text-slate-900">{location.region || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("metaDirections")}
            </dt>
            <dd className="text-slate-900">{location.directionsText || "—"}</dd>
          </div>
          <p className="text-xs text-slate-500">{t("metaReadOnlyHint")}</p>
        </dl>
      ) : (
        <p className="text-sm text-slate-500" data-testid="meta-location-empty">
          {t("metaLocationEmpty")}
        </p>
      )}
    </section>
  );
}

function ContactSection({
  eventId,
  venueId,
  venueName,
  isDraft,
  contact,
  t,
  feedback,
}: {
  eventId: string;
  venueId: string;
  venueName: string | null;
  isDraft: boolean;
  contact: OrganizerEventVenueContact | null;
  t: TFn;
  feedback: { ok: string | null; error: string | null };
}) {
  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="meta-contact-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{t("metaContactTitle")}</h3>
        <p className="text-sm text-slate-600">{t("metaContactSubtitle")}</p>
      </div>
      <Feedback ok={feedback.ok} error={feedback.error} />

      <dl className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            {t("fieldVenue")}
          </dt>
          <dd className="mt-1 font-medium text-slate-900" data-testid="meta-contact-venue-name">
            {venueName ?? venueId}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            {t("fieldVenueId")}
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-slate-700">{venueId}</dd>
        </div>
      </dl>

      {isDraft ? (
        <>
          <form
            action={upsertOrganizerEventVenueContactAction}
            className="space-y-3"
            data-testid="meta-contact-form"
          >
            <input type="hidden" name="event_id" value={eventId} />
            {contact ? <input type="hidden" name="contact_id" value={contact.id} /> : null}
            <div>
              <label
                htmlFor="contact_full_name"
                className="block text-sm font-medium text-slate-700"
              >
                {t("metaContactName")} *
              </label>
              <input
                id="contact_full_name"
                name="contact_full_name"
                type="text"
                required
                defaultValue={contact?.contactFullName ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="contact_phone"
                className="block text-sm font-medium text-slate-700"
              >
                {t("metaContactPhone")} *
              </label>
              <input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                required
                defaultValue={contact?.contactPhone ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <OrganizerSubmitButton
              label={t("metaSaveContact")}
              pendingLabel={t("metaSaving")}
              variant="secondary"
            />
          </form>
          {contact ? (
            <form action={deleteOrganizerEventVenueContactAction} data-testid="meta-contact-delete">
              <input type="hidden" name="event_id" value={eventId} />
              <input type="hidden" name="contact_id" value={contact.id} />
              <OrganizerSubmitButton
                label={t("metaDeleteContact")}
                pendingLabel={t("metaDeleting")}
                variant="danger"
              />
            </form>
          ) : null}
        </>
      ) : contact ? (
        <dl className="grid gap-2 text-sm" data-testid="meta-contact-readonly">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("metaContactName")}
            </dt>
            <dd className="text-slate-900">{contact.contactFullName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("metaContactPhone")}
            </dt>
            <dd className="text-slate-900">{contact.contactPhone}</dd>
          </div>
          <p className="text-xs text-slate-500">{t("metaReadOnlyHint")}</p>
        </dl>
      ) : (
        <p className="text-sm text-slate-500">{t("metaContactEmpty")}</p>
      )}
    </section>
  );
}

function WeddingSection({
  eventId,
  isDraft,
  wedding,
  t,
  feedback,
}: {
  eventId: string;
  isDraft: boolean;
  wedding: OrganizerWeddingDetails | null;
  t: TFn;
  feedback: { ok: string | null; error: string | null };
}) {
  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="meta-wedding-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{t("metaWeddingTitle")}</h3>
        <p className="text-sm text-slate-600">{t("metaWeddingSubtitle")}</p>
      </div>
      <Feedback ok={feedback.ok} error={feedback.error} />

      {isDraft ? (
        <>
          <form
            action={upsertOrganizerEventWeddingDetailsAction}
            className="space-y-3"
            data-testid="meta-wedding-form"
          >
            <input type="hidden" name="event_id" value={eventId} />
            <div>
              <label htmlFor="bride_name" className="block text-sm font-medium text-slate-700">
                {t("metaBrideName")} *
              </label>
              <input
                id="bride_name"
                name="bride_name"
                type="text"
                required
                defaultValue={wedding?.brideName ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="groom_name" className="block text-sm font-medium text-slate-700">
                {t("metaGroomName")} *
              </label>
              <input
                id="groom_name"
                name="groom_name"
                type="text"
                required
                defaultValue={wedding?.groomName ?? ""}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="calendar_export_url"
                className="block text-sm font-medium text-slate-700"
              >
                {t("metaCalendarUrl")}
              </label>
              <input
                id="calendar_export_url"
                name="calendar_export_url"
                type="url"
                defaultValue={wedding?.calendarExportUrl ?? ""}
                placeholder="https://"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <OrganizerSubmitButton
              label={t("metaSaveWedding")}
              pendingLabel={t("metaSaving")}
              variant="secondary"
            />
          </form>
          {wedding ? (
            <form
              action={deleteOrganizerEventWeddingDetailsAction}
              data-testid="meta-wedding-delete"
            >
              <input type="hidden" name="event_id" value={eventId} />
              <OrganizerSubmitButton
                label={t("metaDeleteWedding")}
                pendingLabel={t("metaDeleting")}
                variant="danger"
              />
            </form>
          ) : null}
        </>
      ) : wedding ? (
        <dl className="grid gap-2 text-sm" data-testid="meta-wedding-readonly">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("metaBrideName")}
            </dt>
            <dd className="text-slate-900">{wedding.brideName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("metaGroomName")}
            </dt>
            <dd className="text-slate-900">{wedding.groomName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {t("metaCalendarUrl")}
            </dt>
            <dd className="break-all text-slate-900">
              {wedding.calendarExportUrl || "—"}
            </dd>
          </div>
          <p className="text-xs text-slate-500">{t("metaReadOnlyHint")}</p>
        </dl>
      ) : (
        <p className="text-sm text-slate-500">{t("metaWeddingEmpty")}</p>
      )}
    </section>
  );
}

export function EventMetadataPanels({
  eventId,
  venueId,
  venueName,
  isWedding,
  isDraft,
  locale,
  metadata,
  districts,
  t,
  metaOk,
  metaError,
  metaSection,
}: Props) {
  return (
    <div className="space-y-6" data-testid="event-metadata">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{t("metaSectionHeading")}</h3>
        <p className="text-sm text-slate-600">{t("metaSectionSubtitle")}</p>
      </div>

      <FormatSection
        eventId={eventId}
        isDraft={isDraft}
        formats={metadata.formats}
        t={t}
        feedback={sectionFeedback("format", metaOk, metaError, metaSection, t)}
      />

      <LocationSection
        eventId={eventId}
        isDraft={isDraft}
        locale={locale}
        location={metadata.location}
        districts={districts}
        t={t}
        feedback={sectionFeedback("location", metaOk, metaError, metaSection, t)}
      />

      <ContactSection
        eventId={eventId}
        venueId={venueId}
        venueName={venueName}
        isDraft={isDraft}
        contact={metadata.venueContact}
        t={t}
        feedback={sectionFeedback("contact", metaOk, metaError, metaSection, t)}
      />

      {isWedding ? (
        <WeddingSection
          eventId={eventId}
          isDraft={isDraft}
          wedding={metadata.wedding}
          t={t}
          feedback={sectionFeedback("wedding", metaOk, metaError, metaSection, t)}
        />
      ) : null}
    </div>
  );
}
