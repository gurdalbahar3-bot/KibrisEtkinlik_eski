import {
  saveVenueAreaAction,
  saveVenueTableAction,
} from "@/app/organizer/(app)/venues/layout-actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import type {
  VenueLayoutArea,
  VenueLayoutTable,
} from "@/lib/organizer/data/venue-layout";
import { VENUE_AREA_TYPES, VENUE_TABLE_TYPES } from "@/lib/reservation/capacity";

type Labels = {
  title: string;
  subtitle: string;
  empty: string;
  canvasHint: string;
  areasHeading: string;
  tablesHeading: string;
  addArea: string;
  addTable: string;
  saving: string;
  fieldName: string;
  fieldCapacity: string;
  fieldTableNumber: string;
  fieldPosX: string;
  fieldPosY: string;
  noArea: string;
  capacityLabel: string;
  msgAreaSaved: string;
  msgTableSaved: string;
  errFailed: string;
};

type Props = {
  venueId: string;
  areas: VenueLayoutArea[];
  tables: VenueLayoutTable[];
  labels: Labels;
  layoutOk: string | null;
  layoutError: string | null;
};

function LayoutCanvas({
  tables,
  labels,
}: {
  tables: VenueLayoutTable[];
  labels: Labels;
}) {
  const placed = tables.filter(
    (t) => t.positionX != null && t.positionY != null
  );
  const maxX = Math.max(400, ...placed.map((t) => (t.positionX ?? 0) + 80), 400);
  const maxY = Math.max(280, ...placed.map((t) => (t.positionY ?? 0) + 80), 280);

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">{labels.canvasHint}</p>
      <svg
        viewBox={`0 0 ${maxX} ${maxY}`}
        className="h-64 w-full min-w-[320px] rounded-xl bg-white"
        role="img"
        aria-label={labels.title}
        data-testid="venue-layout-canvas"
      >
        <rect x="0" y="0" width={maxX} height={maxY} fill="#f8fafc" />
        {placed.map((table) => {
          const x = table.positionX ?? 0;
          const y = table.positionY ?? 0;
          const w = table.width ?? 56;
          const h = table.depth ?? 56;
          return (
            <g key={table.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={8}
                fill={
                  table.tableType === "vip"
                    ? "#0f766e"
                    : table.tableType === "standard"
                      ? "#334155"
                      : "#64748b"
                }
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
      {placed.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{labels.empty}</p>
      ) : null}
    </div>
  );
}

export function VenueLayoutPanel({
  venueId,
  areas,
  tables,
  labels,
  layoutOk,
  layoutError,
}: Props) {
  const okMessage =
    layoutOk === "area_saved"
      ? labels.msgAreaSaved
      : layoutOk === "table_saved"
        ? labels.msgTableSaved
        : null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-bold text-slate-900">{labels.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
      </div>

      {okMessage ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">
          {okMessage}
        </p>
      ) : null}
      {layoutError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {labels.errFailed}
        </p>
      ) : null}

      <LayoutCanvas tables={tables} labels={labels} />

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.areasHeading}
        </h4>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {areas.length === 0 ? (
            <li className="py-2 text-slate-500">{labels.empty}</li>
          ) : (
            areas.map((area) => (
              <li key={area.id} className="flex justify-between gap-2 py-2">
                <span className="font-medium text-slate-900">{area.name}</span>
                <span className="text-slate-500">
                  {area.areaType ?? "—"}
                  {area.capacity != null
                    ? ` · ${labels.capacityLabel} ${area.capacity}`
                    : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <form
        action={saveVenueAreaAction}
        className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/40 p-3"
      >
        <input type="hidden" name="venue_id" value={venueId} />
        <p className="text-sm font-semibold text-teal-950">{labels.addArea}</p>
        <input
          name="name"
          required
          placeholder={labels.fieldName}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="area_type"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          defaultValue="hall"
        >
          {VENUE_AREA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          name="capacity"
          type="number"
          min={1}
          placeholder={labels.fieldCapacity}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <OrganizerSubmitButton
          label={labels.addArea}
          pendingLabel={labels.saving}
        />
      </form>

      <form
        action={saveVenueTableAction}
        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <input type="hidden" name="venue_id" value={venueId} />
        <p className="text-sm font-semibold text-slate-900">{labels.addTable}</p>
        <input
          name="table_number"
          required
          placeholder={labels.fieldTableNumber}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="capacity"
          type="number"
          min={1}
          required
          placeholder={labels.fieldCapacity}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="table_type"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          defaultValue="standard"
        >
          {VENUE_TABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          name="area_id"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="">{labels.noArea}</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="position_x"
            type="number"
            step="1"
            placeholder={labels.fieldPosX}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="position_y"
            type="number"
            step="1"
            placeholder={labels.fieldPosY}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <OrganizerSubmitButton
          label={labels.addTable}
          pendingLabel={labels.saving}
        />
      </form>

      <div>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.tablesHeading}
        </h4>
        <ul
          className="mt-2 divide-y divide-slate-100 text-sm"
          data-testid="venue-tables-list"
        >
          {tables.map((table) => (
            <li
              key={table.id}
              className="flex flex-wrap justify-between gap-2 py-2"
            >
              <span className="font-medium text-slate-900">
                #{table.tableNumber}
                {table.tableType ? ` · ${table.tableType}` : ""}
              </span>
              <span className="text-slate-500">
                {labels.capacityLabel} {table.capacity}
                {table.positionX != null && table.positionY != null
                  ? ` · (${table.positionX}, ${table.positionY})`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
