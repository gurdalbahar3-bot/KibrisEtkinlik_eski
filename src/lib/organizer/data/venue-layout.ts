import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VenueLayoutArea = {
  id: string;
  name: string;
  areaType: string | null;
  capacity: number | null;
  sortOrder: number;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  depth: number | null;
};

export type VenueLayoutTable = {
  id: string;
  areaId: string | null;
  tableNumber: string;
  capacity: number;
  tableType: string | null;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  depth: number | null;
};

export type VenueLayoutBundle = {
  areas: VenueLayoutArea[];
  tables: VenueLayoutTable[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedFrom = (table: string) => any;

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Organizer/owner read of venue master layout (areas + tables). */
export async function getOrganizerVenueLayout(
  venueId: string
): Promise<VenueLayoutBundle> {
  const supabase = await createSupabaseServerClient();
  const from = supabase.from.bind(supabase) as UntypedFrom;

  const [areasRes, tablesRes] = await Promise.all([
    from("venue_areas")
      .select(
        "id, name, area_type, capacity, sort_order, position_x, position_y, width, depth"
      )
      .eq("venue_id", venueId)
      .order("sort_order", { ascending: true }),
    from("venue_tables")
      .select(
        "id, area_id, table_number, capacity, table_type, position_x, position_y, width, depth"
      )
      .eq("venue_id", venueId)
      .order("table_number", { ascending: true }),
  ]);

  const areas = ((areasRes.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      areaType: (row.area_type as string | null) ?? null,
      capacity: num(row.capacity),
      sortOrder: Number(row.sort_order ?? 0),
      positionX: num(row.position_x),
      positionY: num(row.position_y),
      width: num(row.width),
      depth: num(row.depth),
    })
  );

  const tables = ((tablesRes.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      areaId: (row.area_id as string | null) ?? null,
      tableNumber: String(row.table_number ?? ""),
      capacity: Number(row.capacity ?? 0),
      tableType: (row.table_type as string | null) ?? null,
      positionX: num(row.position_x),
      positionY: num(row.position_y),
      width: num(row.width),
      depth: num(row.depth),
    })
  );

  return { areas, tables };
}
