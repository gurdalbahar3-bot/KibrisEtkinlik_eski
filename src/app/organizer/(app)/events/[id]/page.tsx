import Link from "next/link";
import { notFound } from "next/navigation";

import {
  submitOrganizerEventForReviewAction,
  updateOrganizerDraftEventAction,
} from "@/app/organizer/(app)/events/actions";
import { EventArtistsPanel } from "@/components/organizer/EventArtistsPanel";
import { EventLayoutCommercePanel } from "@/components/organizer/EventLayoutCommercePanel";
import { EventMetadataPanels } from "@/components/organizer/EventMetadataPanels";
import { EventTicketCommercePanel } from "@/components/organizer/EventTicketCommercePanel";
import { OfficialTicketUrlPanel } from "@/components/organizer/OfficialTicketUrlPanel";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import { requireOrganizer } from "@/lib/organizer/auth";
import { getOrganizerEventArtists } from "@/lib/organizer/data/artists";
import { getOrganizerEventLayoutCommerce } from "@/lib/organizer/data/event-layout";
import { getOrganizerEventMetadata } from "@/lib/organizer/data/event-metadata";
import { getOrganizerEvent } from "@/lib/organizer/data/events";
import { getOrganizerEventTicketCommerce } from "@/lib/organizer/data/ticket-commerce";
import { listActiveDistrictOptions } from "@/lib/organizer/data/venues";
import {
  createOrganizerTranslator,
  getOrganizerMessages,
  resolveOrganizerLocale,
} from "@/lib/organizer/i18n";
import { isEventUuid } from "@/lib/organizer/rpc";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    created?: string;
    saved?: string;
    submitted?: string;
    meta?: string;
    meta_error?: string;
    meta_section?: string;
    ticket?: string;
    ticket_error?: string;
    artists?: string;
    artists_error?: string;
    commerce?: string;
    commerce_error?: string;
    layout?: string;
    layout_error?: string;
  }>;
};

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

function mapEditError(
  error: string | undefined,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string | null {
  if (!error) return null;
  switch (error) {
    case "title_required":
      return t("errTitleRequired");
    case "category_required":
      return t("errCategoryRequired");
    case "not_found":
    case "event_not_found":
      return t("errEventNotFound");
    case "invalid_transition":
      return t("errInvalidTransition");
    case "forbidden":
      return t("errForbidden");
    case "update_failed":
      return t("errUpdateFailed");
    default:
      return t("errSubmitFailed");
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

function statusLabel(
  status: string,
  t: (key: keyof ReturnType<typeof getOrganizerMessages>) => string
): string {
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
}

export default async function OrganizerEventEditPage({ params, searchParams }: Props) {
  const session = await requireOrganizer();
  const { id } = await params;
  const query = await searchParams;

  if (!isEventUuid(id)) {
    notFound();
  }

  const event = await getOrganizerEvent(id, session.userId);
  if (!event) {
    notFound();
  }

  const [locale, metadata, districts, artistsBundle, ticketCommerce, layoutCommerce] =
    await Promise.all([
      resolveOrganizerLocale(),
      getOrganizerEventMetadata(id),
      listActiveDistrictOptions(),
      getOrganizerEventArtists(id),
      getOrganizerEventTicketCommerce(id),
      getOrganizerEventLayoutCommerce(event.id, event.venueId),
    ]);
  const messages = getOrganizerMessages(locale);
  const t = createOrganizerTranslator(messages);
  const isDraft = event.status === "draft";
  const errorMessage = mapEditError(query.error, t);

  let successMessage: string | null = null;
  if (query.created === "1") successMessage = t("msgCreated");
  else if (query.saved === "1") successMessage = t("msgSaved");
  else if (query.submitted === "1") successMessage = t("msgSubmitted");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <Link href="/organizer" className="text-sm font-medium text-teal-800 hover:underline">
          ← {t("dashboard")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold text-slate-900">{t("editTitle")}</h2>
          <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
            {statusLabel(event.status, t)}
          </span>
        </div>
        <p className="text-sm text-slate-600">{t("editSubtitle")}</p>
        <Link
          href={`/organizer/events/${event.id}/check-in`}
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          data-testid="organizer-checkin-link"
        >
          {t("checkInLink")}
        </Link>
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
            {t("fieldVenue")}
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {event.venueName ?? event.venueId}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("fieldStartsAt")}
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {formatDateTime(event.startsAt, locale)}
          </dd>
        </div>
        {event.endsAt ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("fieldEndsAt")}
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {formatDateTime(event.endsAt, locale)}
            </dd>
          </div>
        ) : null}
      </dl>

      {isDraft ? (
        <form
          action={updateOrganizerDraftEventAction}
          className="space-y-4 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm"
        >
          <input type="hidden" name="event_id" value={event.id} />

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
              defaultValue={event.title}
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
              defaultValue={event.description ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-700">
              {t("fieldCategory")} *
            </label>
            <select
              id="category"
              name="category"
              required
              defaultValue={event.category}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key, t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cover" className="block text-sm font-medium text-slate-700">
              {t("fieldCover")}
            </label>
            <input
              id="cover"
              name="cover"
              type="url"
              defaultValue={event.coverImageUrl ?? ""}
              placeholder="https://"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="is_free"
                defaultChecked={event.isFree}
                className="rounded border-slate-300"
              />
              {t("fieldIsFree")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="is_wedding"
                defaultChecked={event.isWedding}
                className="rounded border-slate-300"
                data-testid="event-is-wedding"
              />
              {t("fieldIsWedding")}
            </label>
          </div>

          <p className="text-xs text-slate-500">{t("editLockedHint")}</p>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
          >
            {t("saveDraft")}
          </button>
        </form>
      ) : (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">{event.title}</h3>
          {event.description ? (
            <p className="whitespace-pre-wrap text-sm text-slate-600">{event.description}</p>
          ) : null}
          <p className="text-sm text-slate-600">
            {t("fieldCategory")}: {categoryLabel(event.category, t)}
          </p>
          <p className="text-sm text-slate-500">{t("readOnlyHint")}</p>
        </div>
      )}

      <OfficialTicketUrlPanel
        eventId={event.id}
        isDraft={isDraft}
        officialTicketUrl={event.officialTicketUrl}
        t={t}
        ticketOk={query.ticket === "saved"}
        ticketError={query.ticket_error ?? null}
      />

      <EventTicketCommercePanel
        eventId={event.id}
        isDraft={isDraft}
        locale={locale}
        zones={ticketCommerce.zones}
        commerceOk={query.commerce ?? null}
        commerceError={query.commerce_error ?? null}
        labels={{
          title: t("commerceTitle"),
          subtitle: t("commerceSubtitle"),
          readOnlyHint: t("commerceReadOnlyHint"),
          empty: t("commerceEmpty"),
          addZone: t("commerceAddZone"),
          saveZone: t("commerceSaveZone"),
          savingZone: t("commerceSavingZone"),
          deactivateZone: t("commerceDeactivateZone"),
          deactivatingZone: t("commerceDeactivatingZone"),
          fieldName: t("commerceFieldName"),
          fieldZoneType: t("commerceFieldZoneType"),
          fieldCapacity: t("commerceFieldCapacity"),
          fieldDescription: t("commerceFieldDescription"),
          fieldSortOrder: t("commerceFieldSortOrder"),
          fieldSaleMode: t("commerceFieldSaleMode"),
          saleModeTicketBased: t("commerceSaleModeTicketBased"),
          inventoryCapacity: t("commerceInventoryCapacity"),
          inventorySold: t("commerceInventorySold"),
          inventoryReserved: t("commerceInventoryReserved"),
          inventoryRemaining: t("commerceInventoryRemaining"),
          inventoryWarning: t("commerceInventoryWarning"),
          soldReservedReadonly: t("commerceSoldReservedReadonly"),
          inactiveBadge: t("commerceInactiveBadge"),
          seatBasedReadonly: t("commerceSeatBasedReadonly"),
          addType: t("commerceAddType"),
          saveType: t("commerceSaveType"),
          savingType: t("commerceSavingType"),
          deactivateType: t("commerceDeactivateType"),
          deactivatingType: t("commerceDeactivatingType"),
          fieldPrice: t("commerceFieldPrice"),
          fieldPriceHint: t("commerceFieldPriceHint"),
          fieldMaxPerOrder: t("commerceFieldMaxPerOrder"),
          fieldTypeDescription: t("commerceFieldTypeDescription"),
          typesHeading: t("commerceTypesHeading"),
          noTypes: t("commerceNoTypes"),
          zoneTypeStandard: t("commerceZoneTypeStandard"),
          zoneTypeFrontRow: t("commerceZoneTypeFrontRow"),
          zoneTypeVip: t("commerceZoneTypeVip"),
          zoneTypeOther: t("commerceZoneTypeOther"),
          msgZoneCreated: t("msgCommerceZoneCreated"),
          msgZoneSaved: t("msgCommerceZoneSaved"),
          msgZoneDeactivated: t("msgCommerceZoneDeactivated"),
          msgTypeCreated: t("msgCommerceTypeCreated"),
          msgTypeSaved: t("msgCommerceTypeSaved"),
          msgTypeDeactivated: t("msgCommerceTypeDeactivated"),
          errUnauthenticated: t("errCommerceUnauthenticated"),
          errForbidden: t("errCommerceForbidden"),
          errNotDraft: t("errCommerceNotDraft"),
          errEventNotFound: t("errEventNotFound"),
          errNameRequired: t("errCommerceNameRequired"),
          errInvalidCapacity: t("errCommerceInvalidCapacity"),
          errInvalidZoneType: t("errCommerceInvalidZoneType"),
          errInvalidSaleMode: t("errCommerceInvalidSaleMode"),
          errZoneInUse: t("errCommerceZoneInUse"),
          errZoneNotFound: t("errCommerceZoneNotFound"),
          errZoneNameConflict: t("errCommerceZoneNameConflict"),
          errWrongSaleMode: t("errCommerceWrongSaleMode"),
          errInvalidPrice: t("errCommerceInvalidPrice"),
          errInvalidMaxPerOrder: t("errCommerceInvalidMaxPerOrder"),
          errTicketTypeNotFound: t("errCommerceTicketTypeNotFound"),
          errSaveFailed: t("errCommerceSaveFailed"),
        }}
      />

      <EventLayoutCommercePanel
        eventId={event.id}
        locale={locale}
        bundle={layoutCommerce}
        layoutOk={query.layout ?? null}
        layoutError={query.layout_error ?? null}
        labels={{
          title: t("eventLayoutTitle"),
          subtitle: t("eventLayoutSubtitle"),
          canvasHint: t("eventLayoutCanvasHint"),
          empty: t("eventLayoutEmpty"),
          enableTable: t("eventLayoutEnableTable"),
          saving: t("eventLayoutSaving"),
          fieldTable: t("eventLayoutFieldTable"),
          fieldMaxGuests: t("eventLayoutFieldMaxGuests"),
          fieldPackageName: t("eventLayoutFieldPackageName"),
          fieldBasePrice: t("eventLayoutFieldBasePrice"),
          fieldDeposit: t("eventLayoutFieldDeposit"),
          fieldSaleCategory: t("eventLayoutFieldSaleCategory"),
          fieldDescription: t("eventLayoutFieldDescription"),
          addPackage: t("eventLayoutAddPackage"),
          sellableHeading: t("eventLayoutSellableHeading"),
          packagesHeading: t("eventLayoutPackagesHeading"),
          reservationsHeading: t("eventLayoutReservationsHeading"),
          remainingLabel: t("eventLayoutRemainingLabel"),
          guestsLabel: t("eventLayoutGuestsLabel"),
          statusLabel: t("eventLayoutStatusLabel"),
          msgTableEnabled: t("msgEventLayoutTableEnabled"),
          msgPackageSaved: t("msgEventLayoutPackageSaved"),
          errFailed: t("errEventLayoutFailed"),
          noSellable: t("eventLayoutNoSellable"),
        }}
      />

      <EventArtistsPanel
        eventId={event.id}
        isDraft={isDraft}
        catalog={artistsBundle.catalog}
        attached={artistsBundle.attached}
        artistsOk={query.artists === "saved"}
        artistsError={query.artists_error ?? null}
        labels={{
          title: t("artistsTitle"),
          subtitle: t("artistsSubtitle"),
          saved: t("msgArtistsSaved"),
          readOnlyHint: t("artistsReadOnlyHint"),
          empty: t("artistsEmpty"),
          searchLabel: t("artistsSearchLabel"),
          searchPlaceholder: t("artistsSearchPlaceholder"),
          add: t("artistsAdd"),
          createTitle: t("artistsCreateTitle"),
          fieldName: t("artistsFieldName"),
          fieldSlug: t("artistsFieldSlug"),
          fieldBio: t("artistsFieldBio"),
          fieldImageUrl: t("artistsFieldImageUrl"),
          createSubmit: t("artistsCreateSubmit"),
          createPending: t("artistsCreatePending"),
          fieldRole: t("artistsFieldRole"),
          rolePlaceholder: t("artistsRolePlaceholder"),
          moveUp: t("artistsMoveUp"),
          moveDown: t("artistsMoveDown"),
          remove: t("artistsRemove"),
          save: t("artistsSave"),
          saving: t("artistsSaving"),
          alreadyAttached: t("artistsAlreadyAttached"),
          noSearchResults: t("artistsNoSearchResults"),
          errUnauthenticated: t("errArtistsUnauthenticated"),
          errForbidden: t("errArtistsForbidden"),
          errNameRequired: t("errArtistsNameRequired"),
          errSlugRequired: t("errArtistsSlugRequired"),
          errSlugConflict: t("errArtistsSlugConflict"),
          errArtistNotFound: t("errArtistsNotFound"),
          errArtistInactive: t("errArtistsInactive"),
          errInvalidArtists: t("errArtistsInvalid"),
          errDuplicateArtist: t("errArtistsDuplicate"),
          errNotDraft: t("errArtistsNotDraft"),
          errEventNotFound: t("errEventNotFound"),
          errSaveFailed: t("errArtistsSaveFailed"),
          errCreateFailed: t("errArtistsCreateFailed"),
        }}
      />

      <EventMetadataPanels
        eventId={event.id}
        venueId={event.venueId}
        venueName={event.venueName}
        isWedding={event.isWedding}
        isDraft={isDraft}
        locale={locale}
        metadata={metadata}
        districts={districts}
        t={t}
        metaOk={query.meta ?? null}
        metaError={query.meta_error ?? null}
        metaSection={query.meta_section ?? null}
      />

      {isDraft ? (
        <form
          action={submitOrganizerEventForReviewAction}
          className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/60 p-4"
        >
          <input type="hidden" name="event_id" value={event.id} />
          <p className="text-sm text-teal-950">{t("submitHint")}</p>
          <button
            type="submit"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 sm:w-auto"
          >
            {t("submitForReview")}
          </button>
        </form>
      ) : event.status === "in_review" ? (
        <p className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {t("waitingReview")}
        </p>
      ) : null}
    </div>
  );
}
