import {
  enableEventTableAction,
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
  sellableHeading: string;
  packagesHeading: string;
  reservationsHeading: string;
  remainingLabel: string;
  guestsLabel: string;
  statusLabel: string;
  msgTableEnabled: string;
  msgPackageSaved: string;
  errFailed: string;
  noSellable: string;
};

type Props = {
  eventId: string;
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

export function EventLayoutCommercePanel({
  eventId,
  locale,
  bundle,
  labels,
  layoutOk,
  layoutError,
}: Props) {
  const okMessage =
    layoutOk === "table_enabled"
      ? labels.msgTableEnabled
      : layoutOk === "package_saved"
        ? labels.msgPackageSaved
        : null;

  const enabledTableIds = new Set(bundle.eventTables.map((t) => t.tableId));
  const availableVenueTables = bundle.venueTables.filter(
    (t) => !enabledTableIds.has(t.id)
  );

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="event-layout-commerce-section"
    >
      <div>
        <h3 className="text-lg font-bold text-slate-900">{labels.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
      </div>

      {okMessage ? (
        <p
          className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900"
          role="status"
        >
          {okMessage}
        </p>
      ) : null}
      {layoutError ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {labels.errFailed}
        </p>
      ) : null}

      <SellableMiniMap tables={bundle.eventTables} labels={labels} />

      <form
        action={enableEventTableAction}
        className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/40 p-3"
      >
        <input type="hidden" name="event_id" value={eventId} />
        <p className="text-sm font-semibold text-teal-950">{labels.enableTable}</p>
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

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.sellableHeading}
        </h4>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
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
                    {labels.remainingLabel} {table.remaining}/
                    {table.maxGuests ?? table.venueCapacity}
                  </span>
                </li>
              ))
          )}
        </ul>
      </div>

      <form
        action={upsertEventTablePackageAction}
        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <input type="hidden" name="event_id" value={eventId} />
        <p className="text-sm font-semibold text-slate-900">{labels.addPackage}</p>
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

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.packagesHeading}
        </h4>
        <ul
          className="mt-2 divide-y divide-slate-100 text-sm"
          data-testid="event-packages-list"
        >
          {bundle.packages.length === 0 ? (
            <li className="py-2 text-slate-500">{labels.empty}</li>
          ) : (
            bundle.packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-wrap justify-between gap-2 py-2"
              >
                <span className="font-medium text-slate-900">
                  {pkg.name}
                  <span className="ml-1 text-slate-500">
                    · {pkg.saleCategory}
                    {!pkg.isActive ? " · off" : ""}
                  </span>
                </span>
                <span className="text-slate-700">
                  {formatTicketPrice(pkg.basePrice, locale)}
                  {pkg.depositAmount != null
                    ? ` · dep ${formatTicketPrice(pkg.depositAmount, locale)}`
                    : ""}
                </span>
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
