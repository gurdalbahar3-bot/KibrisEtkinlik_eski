import {
  enableEventTableAction,
  setEventTablePackageActiveAction,
  upsertEventTablePackageAction,
} from "@/app/organizer/(app)/events/layout-actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import type { EventLayoutCommerceBundle } from "@/lib/organizer/data/event-layout";
import { PACKAGE_SALE_CATEGORIES } from "@/lib/reservation/capacity";
import { formatTicketPrice } from "@/lib/discovery/format-price";

type Labels = {
  title: string;
  subtitle: string;
  canvasHint: string;
  empty: string;
  enableTable: string;
  saving: string;
  fieldTable: string;
  fieldMaxGuests: string;
  fieldPackageName: string;
  fieldBasePrice: string;
  fieldDeposit: string;
  fieldSaleCategory: string;
  fieldDescription: string;
  addPackage: string;
  savePackage: string;
  deactivatePackage: string;
  reactivatePackage: string;
  inactiveBadge: string;
  activeBadge: string;
  sellableHeading: string;
  packagesHeading: string;
  reservationsHeading: string;
  remainingLabel: string;
  guestsLabel: string;
  statusLabel: string;
  capacityLabel: string;
  reservationCountLabel: string;
  readOnlyHint: string;
  msgTableEnabled: string;
  msgPackageSaved: string;
  msgPackageUpdated: string;
  msgPackageDeactivated: string;
  msgPackageReactivated: string;
  errFailed: string;
  errNotDraft: string;
  noSellable: string;
};

type Props = {
  eventId: string;
  isDraft: boolean;
  locale: "tr" | "en";
  bundle: EventLayoutCommerceBundle;
  labels: Labels;
  layoutOk: string | null;
  layoutError: string | null;
};

function SellableMiniMap({
  tables,
  labels,
}: {
  tables: EventLayoutCommerceBundle["eventTables"];
  labels: Labels;
}) {
  const sellable = tables.filter((t) => t.isSellable);
  const placed = sellable.filter(
    (t) => t.positionX != null && t.positionY != null
  );
  const maxX = Math.max(400, ...placed.map((t) => (t.positionX ?? 0) + 80), 400);
  const maxY = Math.max(280, ...placed.map((t) => (t.positionY ?? 0) + 80), 280);

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">{labels.canvasHint}</p>
      <svg
        viewBox={`0 0 ${maxX} ${maxY}`}
        className="h-56 w-full min-w-[280px] rounded-xl bg-white"
        role="img"
        aria-label={labels.sellableHeading}
        data-testid="event-layout-canvas"
      >
        <rect x="0" y="0" width={maxX} height={maxY} fill="#f8fafc" />
        {placed.map((table) => {
          const x = table.positionX ?? 0;
          const y = table.positionY ?? 0;
          const w = 56;
          const h = 56;
          const full = table.remaining <= 0;
          return (
            <g key={table.eventTableId}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={8}
                fill={full ? "#94a3b8" : "#0f766e"}
              />
              <text
                x={x + w / 2}
                y={y + h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="11"
                fontWeight="600"
              >
                {table.tableNumber}
              </text>
            </g>
          );
        })}
      </svg>
      {sellable.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{labels.noSellable}</p>
      ) : null}
    </div>
  );
}

function okLabel(ok: string | null, labels: Labels): string | null {
  switch (ok) {
    case "table_enabled":
      return labels.msgTableEnabled;
    case "package_saved":
      return labels.msgPackageSaved;
    case "package_updated":
      return labels.msgPackageUpdated;
    case "package_deactivated":
      return labels.msgPackageDeactivated;
    case "package_reactivated":
      return labels.msgPackageReactivated;
    default:
      return null;
  }
}

function errLabel(error: string | null, labels: Labels): string | null {
  if (!error) return null;
  if (error === "not_draft") return labels.errNotDraft;
  return labels.errFailed;
}

export function EventLayoutCommercePanel({
  eventId,
  isDraft,
  locale,
  bundle,
  labels,
  layoutOk,
  layoutError,
}: Props) {
  const okMessage = okLabel(layoutOk, labels);
  const errorMessage = errLabel(layoutError, labels);

  const enabledTableIds = new Set(bundle.eventTables.map((t) => t.tableId));
  const availableVenueTables = bundle.venueTables.filter(
    (t) => !enabledTableIds.has(t.id)
  );

  const reservationCountByTable = new Map<string, number>();
  for (const res of bundle.reservations) {
    reservationCountByTable.set(
      res.tableId,
      (reservationCountByTable.get(res.tableId) ?? 0) + 1
    );
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="event-layout-commerce-section"
    >
      <div>
        <h3 className="text-lg font-bold text-slate-900">{labels.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
        {!isDraft ? (
          <p className="mt-2 text-xs text-amber-800" data-testid="event-layout-readonly">
            {labels.readOnlyHint}
          </p>
        ) : null}
      </div>

      {okMessage ? (
        <p
          className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900"
          role="status"
        >
          {okMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <SellableMiniMap tables={bundle.eventTables} labels={labels} />

      {isDraft ? (
        <form
          action={enableEventTableAction}
          className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/40 p-3"
        >
          <input type="hidden" name="event_id" value={eventId} />
          <p className="text-sm font-semibold text-teal-950">
            {labels.enableTable}
          </p>
          <select
            name="table_id"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            defaultValue=""
            data-testid="event-enable-table-select"
          >
            <option value="" disabled>
              {labels.fieldTable}
            </option>
            {availableVenueTables.map((table) => (
              <option key={table.id} value={table.id}>
                #{table.tableNumber}
                {table.tableType ? ` · ${table.tableType}` : ""}
                {table.areaName ? ` · ${table.areaName}` : ""} · cap{" "}
                {table.capacity}
              </option>
            ))}
          </select>
          <input
            name="max_guests"
            type="number"
            min={1}
            placeholder={labels.fieldMaxGuests}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input type="hidden" name="is_sellable" value="true" />
          <OrganizerSubmitButton
            label={labels.enableTable}
            pendingLabel={labels.saving}
          />
        </form>
      ) : null}

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.sellableHeading}
        </h4>
        <ul className="mt-2 divide-y divide-slate-100 text-sm" data-testid="event-enabled-tables">
          {bundle.eventTables.filter((t) => t.isSellable).length === 0 ? (
            <li className="py-2 text-slate-500">{labels.empty}</li>
          ) : (
            bundle.eventTables
              .filter((t) => t.isSellable)
              .map((table) => (
                <li
                  key={table.eventTableId}
                  className="flex flex-wrap justify-between gap-2 py-2"
                >
                  <span className="font-medium text-slate-900">
                    #{table.tableNumber}
                    {table.tableType ? ` · ${table.tableType}` : ""}
                  </span>
                  <span className="text-slate-500">
                    {labels.capacityLabel}{" "}
                    {table.maxGuests ?? table.venueCapacity} ·{" "}
                    {labels.remainingLabel} {table.remaining} ·{" "}
                    {labels.reservationCountLabel}{" "}
                    {reservationCountByTable.get(table.tableId) ?? 0}
                  </span>
                </li>
              ))
          )}
        </ul>
      </div>

      {isDraft ? (
        <form
          action={upsertEventTablePackageAction}
          className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
          data-testid="event-package-create-form"
        >
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="is_active" value="true" />
          <p className="text-sm font-semibold text-slate-900">
            {labels.addPackage}
          </p>
          <select
            name="event_table_id"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              {labels.fieldTable}
            </option>
            {bundle.eventTables
              .filter((t) => t.isSellable)
              .map((table) => (
                <option key={table.eventTableId} value={table.eventTableId}>
                  #{table.tableNumber}
                </option>
              ))}
          </select>
          <input
            name="name"
            required
            placeholder={labels.fieldPackageName}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="base_price"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder={labels.fieldBasePrice}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="deposit_amount"
            type="number"
            min={0}
            step="0.01"
            placeholder={labels.fieldDeposit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="sale_category"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            defaultValue="table"
          >
            {PACKAGE_SALE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <input
            name="description"
            placeholder={labels.fieldDescription}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <OrganizerSubmitButton
            label={labels.addPackage}
            pendingLabel={labels.saving}
          />
        </form>
      ) : null}

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.packagesHeading}
        </h4>
        <ul
          className="mt-2 space-y-4"
          data-testid="event-packages-list"
        >
          {bundle.packages.length === 0 ? (
            <li className="py-2 text-sm text-slate-500">{labels.empty}</li>
          ) : (
            bundle.packages.map((pkg) => (
              <li
                key={pkg.id}
                className="rounded-xl border border-slate-100 p-3"
                data-testid="event-package-row"
                data-active={pkg.isActive ? "1" : "0"}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-900">
                    {pkg.name}
                    <span className="ml-1 text-slate-500">
                      · {pkg.saleCategory}
                    </span>
                  </span>
                  <span
                    className={
                      pkg.isActive
                        ? "rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-900"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                    }
                  >
                    {pkg.isActive ? labels.activeBadge : labels.inactiveBadge}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {formatTicketPrice(pkg.basePrice, locale)}
                  {pkg.depositAmount != null
                    ? ` · dep ${formatTicketPrice(pkg.depositAmount, locale)}`
                    : ""}
                </p>

                {isDraft ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <form
                      action={upsertEventTablePackageAction}
                      className="space-y-2"
                    >
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="package_id" value={pkg.id} />
                      <input
                        type="hidden"
                        name="event_table_id"
                        value={pkg.eventTableId}
                      />
                      <input
                        type="hidden"
                        name="is_active"
                        value={pkg.isActive ? "true" : "false"}
                      />
                      <input
                        name="name"
                        required
                        defaultValue={pkg.name}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="base_price"
                        type="number"
                        min={0}
                        step="0.01"
                        required
                        defaultValue={pkg.basePrice}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="deposit_amount"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={pkg.depositAmount ?? ""}
                        placeholder={labels.fieldDeposit}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <select
                        name="sale_category"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        defaultValue={pkg.saleCategory}
                      >
                        {PACKAGE_SALE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <input
                        name="description"
                        defaultValue={pkg.description ?? ""}
                        placeholder={labels.fieldDescription}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <OrganizerSubmitButton
                        label={labels.savePackage}
                        pendingLabel={labels.saving}
                      />
                    </form>
                    <form action={setEventTablePackageActiveAction}>
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="package_id" value={pkg.id} />
                      <input
                        type="hidden"
                        name="event_table_id"
                        value={pkg.eventTableId}
                      />
                      <input
                        type="hidden"
                        name="is_active"
                        value={pkg.isActive ? "false" : "true"}
                      />
                      <OrganizerSubmitButton
                        label={
                          pkg.isActive
                            ? labels.deactivatePackage
                            : labels.reactivatePackage
                        }
                        pendingLabel={labels.saving}
                      />
                    </form>
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.reservationsHeading}
        </h4>
        <ul
          className="mt-2 divide-y divide-slate-100 text-sm"
          data-testid="event-reservations-list"
        >
          {bundle.reservations.length === 0 ? (
            <li className="py-2 text-slate-500">{labels.empty}</li>
          ) : (
            bundle.reservations.map((res) => (
              <li
                key={res.id}
                className="flex flex-wrap justify-between gap-2 py-2"
              >
                <span className="font-medium text-slate-900">
                  #{res.tableNumber}
                  {res.packageName ? ` · ${res.packageName}` : ""}
                </span>
                <span className="text-slate-500">
                  {labels.guestsLabel} {res.guestCount} · {labels.statusLabel}{" "}
                  {res.status}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
