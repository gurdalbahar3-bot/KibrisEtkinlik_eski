import {
  deactivateOrganizerEventTicketZoneAction,
  upsertOrganizerEventTicketTypeAction,
  upsertOrganizerEventTicketZoneAction,
} from "@/app/organizer/(app)/events/actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import { formatTicketPrice } from "@/lib/discovery/format-price";
import type { OrganizerTicketZone } from "@/lib/organizer/data/ticket-commerce";
import { EVENT_TICKET_ZONE_TYPES } from "@/lib/organizer/rpc";

export type EventTicketCommercePanelLabels = {
  title: string;
  subtitle: string;
  readOnlyHint: string;
  empty: string;
  addZone: string;
  saveZone: string;
  savingZone: string;
  deactivateZone: string;
  deactivatingZone: string;
  fieldName: string;
  fieldZoneType: string;
  fieldCapacity: string;
  fieldDescription: string;
  fieldSortOrder: string;
  fieldSaleMode: string;
  saleModeTicketBased: string;
  inventoryCapacity: string;
  inventorySold: string;
  inventoryReserved: string;
  inventoryRemaining: string;
  inventoryWarning: string;
  soldReservedReadonly: string;
  inactiveBadge: string;
  seatBasedReadonly: string;
  addType: string;
  saveType: string;
  savingType: string;
  deactivateType: string;
  deactivatingType: string;
  fieldPrice: string;
  fieldPriceHint: string;
  fieldMaxPerOrder: string;
  fieldTypeDescription: string;
  typesHeading: string;
  noTypes: string;
  zoneTypeStandard: string;
  zoneTypeFrontRow: string;
  zoneTypeVip: string;
  zoneTypeOther: string;
  msgZoneCreated: string;
  msgZoneSaved: string;
  msgZoneDeactivated: string;
  msgTypeCreated: string;
  msgTypeSaved: string;
  msgTypeDeactivated: string;
  errUnauthenticated: string;
  errForbidden: string;
  errNotDraft: string;
  errEventNotFound: string;
  errNameRequired: string;
  errInvalidCapacity: string;
  errInvalidZoneType: string;
  errInvalidSaleMode: string;
  errZoneInUse: string;
  errZoneNotFound: string;
  errZoneNameConflict: string;
  errWrongSaleMode: string;
  errInvalidPrice: string;
  errInvalidMaxPerOrder: string;
  errTicketTypeNotFound: string;
  errSaveFailed: string;
  errFreeConflictWithPaidType: string;
  errFreeHasPaidTickets: string;
  errPaidRequiresCatalog: string;
};

type Props = {
  eventId: string;
  isDraft: boolean;
  locale: "tr" | "en";
  zones: OrganizerTicketZone[];
  labels: EventTicketCommercePanelLabels;
  commerceOk: string | null;
  commerceError: string | null;
};

function mapCommerceOk(
  ok: string | null,
  labels: EventTicketCommercePanelLabels
): string | null {
  switch (ok) {
    case "zone_created":
      return labels.msgZoneCreated;
    case "zone_saved":
      return labels.msgZoneSaved;
    case "zone_deactivated":
      return labels.msgZoneDeactivated;
    case "type_created":
      return labels.msgTypeCreated;
    case "type_saved":
      return labels.msgTypeSaved;
    case "type_deactivated":
      return labels.msgTypeDeactivated;
    default:
      return null;
  }
}

function mapCommerceError(
  error: string | null,
  labels: EventTicketCommercePanelLabels
): string | null {
  if (!error) return null;
  switch (error) {
    case "unauthenticated":
      return labels.errUnauthenticated;
    case "forbidden":
      return labels.errForbidden;
    case "not_draft":
      return labels.errNotDraft;
    case "not_found":
    case "event_not_found":
      return labels.errEventNotFound;
    case "name_required":
      return labels.errNameRequired;
    case "invalid_capacity":
      return labels.errInvalidCapacity;
    case "invalid_zone_type":
      return labels.errInvalidZoneType;
    case "invalid_sale_mode":
      return labels.errInvalidSaleMode;
    case "zone_in_use":
      return labels.errZoneInUse;
    case "zone_not_found":
      return labels.errZoneNotFound;
    case "zone_name_conflict":
      return labels.errZoneNameConflict;
    case "wrong_sale_mode":
      return labels.errWrongSaleMode;
    case "invalid_price":
      return labels.errInvalidPrice;
    case "invalid_max_per_order":
      return labels.errInvalidMaxPerOrder;
    case "ticket_type_not_found":
      return labels.errTicketTypeNotFound;
    case "free_conflict_with_paid_type":
      return labels.errFreeConflictWithPaidType;
    case "free_has_paid_tickets":
      return labels.errFreeHasPaidTickets;
    case "paid_requires_catalog":
      return labels.errPaidRequiresCatalog;
    default:
      return labels.errSaveFailed;
  }
}

function zoneTypeLabel(
  zoneType: string,
  labels: EventTicketCommercePanelLabels
): string {
  switch (zoneType) {
    case "standard":
      return labels.zoneTypeStandard;
    case "front_row":
      return labels.zoneTypeFrontRow;
    case "vip":
      return labels.zoneTypeVip;
    case "other":
      return labels.zoneTypeOther;
    default:
      return zoneType;
  }
}

export function EventTicketCommercePanel({
  eventId,
  isDraft,
  locale,
  zones,
  labels,
  commerceOk,
  commerceError,
}: Props) {
  const okMessage = mapCommerceOk(commerceOk, labels);
  const errorMessage = mapCommerceError(commerceError, labels);

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="ticket-commerce-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-600">{labels.subtitle}</p>
      </div>

      {okMessage ? (
        <p
          className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900"
          role="status"
          data-testid="ticket-commerce-saved"
        >
          {okMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="ticket-commerce-error"
        >
          {errorMessage}
        </p>
      ) : null}

      {zones.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="ticket-commerce-empty">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-4" data-testid="ticket-commerce-zones">
          {zones.map((zone) => {
            const isTicketBased = zone.saleMode === "ticket_based";
            const inventoryWarn = zone.remaining < 0;

            return (
              <li
                key={zone.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                data-testid="ticket-commerce-zone"
                data-zone-id={zone.id}
                data-sale-mode={zone.saleMode}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-slate-900" data-testid="ticket-zone-name">
                    {zone.name}
                  </h4>
                  {!zone.isActive ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                      {labels.inactiveBadge}
                    </span>
                  ) : null}
                  {!isTicketBased ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {labels.seatBasedReadonly}
                    </span>
                  ) : null}
                </div>

                <dl
                  className="grid gap-2 text-sm sm:grid-cols-2"
                  data-testid="ticket-zone-inventory"
                >
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      {labels.inventoryCapacity}
                    </dt>
                    <dd className="font-medium text-slate-900" data-testid="ticket-zone-capacity">
                      {zone.capacity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      {labels.inventorySold}
                    </dt>
                    <dd
                      className="font-medium text-slate-900"
                      data-testid="ticket-zone-sold"
                      data-readonly="true"
                    >
                      {zone.soldCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      {labels.inventoryReserved}
                    </dt>
                    <dd
                      className="font-medium text-slate-900"
                      data-testid="ticket-zone-reserved"
                      data-readonly="true"
                    >
                      {zone.reservedCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      {labels.inventoryRemaining}
                    </dt>
                    <dd
                      className={`font-medium ${inventoryWarn ? "text-amber-800" : "text-slate-900"}`}
                      data-testid="ticket-zone-remaining"
                    >
                      {zone.remaining}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-slate-500">{labels.soldReservedReadonly}</p>
                {inventoryWarn ? (
                  <p
                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950"
                    role="status"
                    data-testid="ticket-zone-inventory-warning"
                  >
                    {labels.inventoryWarning}
                  </p>
                ) : null}

                {isDraft && isTicketBased ? (
                  <>
                    <form
                      action={upsertOrganizerEventTicketZoneAction}
                      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
                      data-testid="ticket-zone-edit-form"
                    >
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="zone_id" value={zone.id} />
                      <input type="hidden" name="is_active" value={zone.isActive ? "true" : "false"} />
                      <div>
                        <label
                          htmlFor={`zone_name_${zone.id}`}
                          className="block text-sm font-medium text-slate-700"
                        >
                          {labels.fieldName}
                        </label>
                        <input
                          id={`zone_name_${zone.id}`}
                          name="name"
                          type="text"
                          required
                          maxLength={120}
                          defaultValue={zone.name}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          data-testid="ticket-zone-edit-name"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor={`zone_type_${zone.id}`}
                            className="block text-sm font-medium text-slate-700"
                          >
                            {labels.fieldZoneType}
                          </label>
                          <select
                            id={`zone_type_${zone.id}`}
                            name="zone_type"
                            defaultValue={zone.zoneType}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            data-testid="ticket-zone-edit-type"
                          >
                            {EVENT_TICKET_ZONE_TYPES.map((zt) => (
                              <option key={zt} value={zt}>
                                {zoneTypeLabel(zt, labels)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor={`zone_capacity_${zone.id}`}
                            className="block text-sm font-medium text-slate-700"
                          >
                            {labels.fieldCapacity}
                          </label>
                          <input
                            id={`zone_capacity_${zone.id}`}
                            name="capacity"
                            type="number"
                            required
                            min={1}
                            defaultValue={zone.capacity}
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            data-testid="ticket-zone-edit-capacity"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor={`zone_desc_${zone.id}`}
                          className="block text-sm font-medium text-slate-700"
                        >
                          {labels.fieldDescription}
                        </label>
                        <textarea
                          id={`zone_desc_${zone.id}`}
                          name="description"
                          rows={2}
                          maxLength={1000}
                          defaultValue={zone.description ?? ""}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          data-testid="ticket-zone-edit-description"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`zone_sort_${zone.id}`}
                          className="block text-sm font-medium text-slate-700"
                        >
                          {labels.fieldSortOrder}
                        </label>
                        <input
                          id={`zone_sort_${zone.id}`}
                          name="sort_order"
                          type="number"
                          defaultValue={zone.sortOrder}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          data-testid="ticket-zone-edit-sort"
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        {labels.fieldSaleMode}: {labels.saleModeTicketBased}
                      </p>
                      <OrganizerSubmitButton
                        label={labels.saveZone}
                        pendingLabel={labels.savingZone}
                        variant="secondary"
                      />
                    </form>

                    {zone.isActive ? (
                      <form
                        action={deactivateOrganizerEventTicketZoneAction}
                        data-testid="ticket-zone-deactivate-form"
                      >
                        <input type="hidden" name="event_id" value={eventId} />
                        <input type="hidden" name="zone_id" value={zone.id} />
                        <OrganizerSubmitButton
                          label={labels.deactivateZone}
                          pendingLabel={labels.deactivatingZone}
                          variant="danger"
                        />
                      </form>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-slate-600" data-testid="ticket-zone-readonly">
                    <p>
                      {labels.fieldZoneType}: {zoneTypeLabel(zone.zoneType, labels)}
                    </p>
                    <p>
                      {labels.fieldSaleMode}: {zone.saleMode}
                    </p>
                    {zone.description ? <p>{zone.description}</p> : null}
                  </div>
                )}

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <h5 className="text-sm font-semibold text-slate-900">{labels.typesHeading}</h5>
                  {zone.types.length === 0 ? (
                    <p className="text-sm text-slate-500">{labels.noTypes}</p>
                  ) : (
                    <ul className="space-y-2" data-testid="ticket-type-list">
                      {zone.types.map((ticketType) => (
                        <li
                          key={ticketType.id}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                          data-testid="ticket-type-row"
                          data-type-id={ticketType.id}
                          data-active={ticketType.isActive ? "true" : "false"}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p
                              className="font-medium text-slate-900"
                              data-testid="ticket-type-name"
                            >
                              {ticketType.name}
                              {!ticketType.isActive ? (
                                <span className="ml-2 text-xs font-normal text-amber-800">
                                  ({labels.inactiveBadge})
                                </span>
                              ) : null}
                            </p>
                            <p
                              className="text-sm font-semibold text-teal-900"
                              data-testid="ticket-type-price"
                            >
                              {formatTicketPrice(ticketType.price, locale)}
                            </p>
                          </div>
                          {ticketType.maxPerOrder != null ? (
                            <p className="text-xs text-slate-500" data-testid="ticket-type-max">
                              Max/order: {ticketType.maxPerOrder}
                            </p>
                          ) : null}

                          {isDraft && isTicketBased ? (
                            <div className="mt-3 space-y-2">
                              <form
                                action={upsertOrganizerEventTicketTypeAction}
                                className="space-y-2"
                                data-testid="ticket-type-edit-form"
                              >
                                <input type="hidden" name="event_id" value={eventId} />
                                <input type="hidden" name="zone_id" value={zone.id} />
                                <input
                                  type="hidden"
                                  name="ticket_type_id"
                                  value={ticketType.id}
                                />
                                <input type="hidden" name="is_active" value="true" />
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <label
                                      htmlFor={`type_name_${ticketType.id}`}
                                      className="block text-xs font-medium text-slate-600"
                                    >
                                      {labels.fieldName}
                                    </label>
                                    <input
                                      id={`type_name_${ticketType.id}`}
                                      name="name"
                                      type="text"
                                      required
                                      defaultValue={ticketType.name}
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                      data-testid="ticket-type-edit-name"
                                    />
                                  </div>
                                  <div>
                                    <label
                                      htmlFor={`type_price_${ticketType.id}`}
                                      className="block text-xs font-medium text-slate-600"
                                    >
                                      {labels.fieldPrice}
                                    </label>
                                    <input
                                      id={`type_price_${ticketType.id}`}
                                      name="price"
                                      type="number"
                                      required
                                      min={0}
                                      step="0.01"
                                      defaultValue={ticketType.price}
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                      data-testid="ticket-type-edit-price"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label
                                    htmlFor={`type_max_${ticketType.id}`}
                                    className="block text-xs font-medium text-slate-600"
                                  >
                                    {labels.fieldMaxPerOrder}
                                  </label>
                                  <input
                                    id={`type_max_${ticketType.id}`}
                                    name="max_per_order"
                                    type="number"
                                    min={1}
                                    defaultValue={ticketType.maxPerOrder ?? ""}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    data-testid="ticket-type-edit-max"
                                  />
                                </div>
                                <div>
                                  <label
                                    htmlFor={`type_desc_${ticketType.id}`}
                                    className="block text-xs font-medium text-slate-600"
                                  >
                                    {labels.fieldTypeDescription}
                                  </label>
                                  <textarea
                                    id={`type_desc_${ticketType.id}`}
                                    name="description"
                                    rows={2}
                                    defaultValue={ticketType.description ?? ""}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                    data-testid="ticket-type-edit-description"
                                  />
                                </div>
                                <OrganizerSubmitButton
                                  label={labels.saveType}
                                  pendingLabel={labels.savingType}
                                  variant="secondary"
                                />
                              </form>
                              {ticketType.isActive ? (
                                <form
                                  action={upsertOrganizerEventTicketTypeAction}
                                  data-testid="ticket-type-deactivate-form"
                                >
                                  <input type="hidden" name="event_id" value={eventId} />
                                  <input type="hidden" name="zone_id" value={zone.id} />
                                  <input
                                    type="hidden"
                                    name="ticket_type_id"
                                    value={ticketType.id}
                                  />
                                  <input type="hidden" name="name" value={ticketType.name} />
                                  <input type="hidden" name="price" value={String(ticketType.price)} />
                                  <input
                                    type="hidden"
                                    name="description"
                                    value={ticketType.description ?? ""}
                                  />
                                  <input
                                    type="hidden"
                                    name="max_per_order"
                                    value={
                                      ticketType.maxPerOrder != null
                                        ? String(ticketType.maxPerOrder)
                                        : ""
                                    }
                                  />
                                  <input type="hidden" name="is_active" value="false" />
                                  <OrganizerSubmitButton
                                    label={labels.deactivateType}
                                    pendingLabel={labels.deactivatingType}
                                    variant="danger"
                                  />
                                </form>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {isDraft && isTicketBased ? (
                    <form
                      action={upsertOrganizerEventTicketTypeAction}
                      className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-3"
                      data-testid="ticket-type-create-form"
                    >
                      <h6 className="text-sm font-semibold text-slate-900">{labels.addType}</h6>
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="zone_id" value={zone.id} />
                      <input type="hidden" name="is_active" value="true" />
                      <div>
                        <label
                          htmlFor={`new_type_name_${zone.id}`}
                          className="block text-xs font-medium text-slate-600"
                        >
                          {labels.fieldName}
                        </label>
                        <input
                          id={`new_type_name_${zone.id}`}
                          name="name"
                          type="text"
                          required
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          data-testid="ticket-type-create-name"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`new_type_price_${zone.id}`}
                          className="block text-xs font-medium text-slate-600"
                        >
                          {labels.fieldPrice}
                        </label>
                        <input
                          id={`new_type_price_${zone.id}`}
                          name="price"
                          type="number"
                          required
                          min={0}
                          step="0.01"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          data-testid="ticket-type-create-price"
                        />
                        <p className="mt-1 text-xs text-slate-500">{labels.fieldPriceHint}</p>
                      </div>
                      <div>
                        <label
                          htmlFor={`new_type_max_${zone.id}`}
                          className="block text-xs font-medium text-slate-600"
                        >
                          {labels.fieldMaxPerOrder}
                        </label>
                        <input
                          id={`new_type_max_${zone.id}`}
                          name="max_per_order"
                          type="number"
                          min={1}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          data-testid="ticket-type-create-max"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`new_type_desc_${zone.id}`}
                          className="block text-xs font-medium text-slate-600"
                        >
                          {labels.fieldTypeDescription}
                        </label>
                        <textarea
                          id={`new_type_desc_${zone.id}`}
                          name="description"
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          data-testid="ticket-type-create-description"
                        />
                      </div>
                      <OrganizerSubmitButton
                        label={labels.addType}
                        pendingLabel={labels.savingType}
                        variant="secondary"
                      />
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isDraft ? (
        <form
          action={upsertOrganizerEventTicketZoneAction}
          className="space-y-3 rounded-xl border border-dashed border-teal-200 bg-teal-50/40 p-4"
          data-testid="ticket-zone-create-form"
        >
          <h4 className="text-sm font-semibold text-slate-900">{labels.addZone}</h4>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="is_active" value="true" />
          <div>
            <label htmlFor="new_zone_name" className="block text-sm font-medium text-slate-700">
              {labels.fieldName}
            </label>
            <input
              id="new_zone_name"
              name="name"
              type="text"
              required
              maxLength={120}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              data-testid="ticket-zone-create-name"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new_zone_type" className="block text-sm font-medium text-slate-700">
                {labels.fieldZoneType}
              </label>
              <select
                id="new_zone_type"
                name="zone_type"
                defaultValue="standard"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="ticket-zone-create-type"
              >
                {EVENT_TICKET_ZONE_TYPES.map((zt) => (
                  <option key={zt} value={zt}>
                    {zoneTypeLabel(zt, labels)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="new_zone_capacity"
                className="block text-sm font-medium text-slate-700"
              >
                {labels.fieldCapacity}
              </label>
              <input
                id="new_zone_capacity"
                name="capacity"
                type="number"
                required
                min={1}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="ticket-zone-create-capacity"
              />
            </div>
          </div>
          <div>
            <label htmlFor="new_zone_desc" className="block text-sm font-medium text-slate-700">
              {labels.fieldDescription}
            </label>
            <textarea
              id="new_zone_desc"
              name="description"
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              data-testid="ticket-zone-create-description"
            />
          </div>
          <div>
            <label htmlFor="new_zone_sort" className="block text-sm font-medium text-slate-700">
              {labels.fieldSortOrder}
            </label>
            <input
              id="new_zone_sort"
              name="sort_order"
              type="number"
              defaultValue={0}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              data-testid="ticket-zone-create-sort"
            />
          </div>
          <p className="text-xs text-slate-500">
            {labels.fieldSaleMode}: {labels.saleModeTicketBased}
          </p>
          <OrganizerSubmitButton
            label={labels.addZone}
            pendingLabel={labels.savingZone}
            variant="secondary"
          />
        </form>
      ) : (
        <p className="text-xs text-slate-500" data-testid="ticket-commerce-readonly">
          {labels.readOnlyHint}
        </p>
      )}
    </section>
  );
}
