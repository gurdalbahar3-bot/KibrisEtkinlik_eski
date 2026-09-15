import {
  parseOrganizerRpcJson,
  type StagingDeactivateEventTicketZoneArgs,
  type StagingUpsertEventTicketTypeArgs,
  type StagingUpsertEventTicketZoneArgs,
} from "@/lib/organizer/rpc";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

export type OrganizerTicketType = {
  id: string;
  zoneId: string;
  name: string;
  price: number;
  description: string | null;
  maxPerOrder: number | null;
  isActive: boolean;
};

export type OrganizerTicketZone = {
  id: string;
  name: string;
  zoneType: string;
  saleMode: string;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  remaining: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  types: OrganizerTicketType[];
};

export type OrganizerTicketCommerceBundle = {
  zones: OrganizerTicketZone[];
};

type ZoneRow = {
  id: string;
  name: string;
  zone_type: string;
  sale_mode: string;
  capacity: number;
  reserved_count: number;
  sold_count: number;
  description: string | null;
  sort_order: number | null;
  is_active: boolean;
};

type TypeRow = {
  id: string;
  zone_id: string;
  name: string;
  price: number | string;
  description: string | null;
  max_per_order: number | null;
  is_active: boolean;
};

/** Hand-maintained Database select inference collapses; use untyped from like metadata. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedFrom = (table: string) => any;

function toPriceNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Authenticated read via RLS: published OR can_manage_event. */
export async function getOrganizerEventTicketCommerce(
  eventId: string
): Promise<OrganizerTicketCommerceBundle> {
  const supabase = await createSupabaseServerClient();
  const from = supabase.from.bind(supabase) as UntypedFrom;

  const [zonesRes, typesRes] = await Promise.all([
    from("event_ticket_zones")
      .select(
        "id, name, zone_type, sale_mode, capacity, reserved_count, sold_count, description, sort_order, is_active"
      )
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
    from("event_ticket_types")
      .select(
        "id, zone_id, name, price, description, max_per_order, is_active"
      )
      .eq("event_id", eventId)
      .order("name", { ascending: true }),
  ]);

  const typesByZone = new Map<string, OrganizerTicketType[]>();
  if (!typesRes.error) {
    for (const row of (typesRes.data ?? []) as TypeRow[]) {
      const list = typesByZone.get(row.zone_id) ?? [];
      list.push({
        id: row.id,
        zoneId: row.zone_id,
        name: row.name,
        price: toPriceNumber(row.price),
        description: row.description,
        maxPerOrder: row.max_per_order,
        isActive: row.is_active,
      });
      typesByZone.set(row.zone_id, list);
    }
  }

  const zones: OrganizerTicketZone[] = zonesRes.error
    ? []
    : ((zonesRes.data ?? []) as ZoneRow[]).map((row) => {
        const remaining = row.capacity - row.reserved_count - row.sold_count;
        return {
          id: row.id,
          name: row.name,
          zoneType: row.zone_type,
          saleMode: row.sale_mode,
          capacity: row.capacity,
          reservedCount: row.reserved_count,
          soldCount: row.sold_count,
          remaining,
          description: row.description,
          sortOrder: row.sort_order ?? 0,
          isActive: row.is_active,
          types: typesByZone.get(row.id) ?? [],
        };
      });

  return { zones };
}

export type TicketCommerceMutationResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string };

export async function upsertOrganizerEventTicketZone(
  args: StagingUpsertEventTicketZoneArgs
): Promise<TicketCommerceMutationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "upsert_event_ticket_zone_atomic",
    params: StagingUpsertEventTicketZoneArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "upsert_event_ticket_zone_atomic",
    args
  );

  if (error) return { ok: false, reason: "rpc_failed" };
  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    return {
      ok: false,
      reason: (payload.error_code ?? "mutation_failed").toLowerCase(),
    };
  }
  return {
    ok: true,
    id: typeof payload.zone_id === "string" ? payload.zone_id : undefined,
  };
}

export async function deactivateOrganizerEventTicketZone(
  args: StagingDeactivateEventTicketZoneArgs
): Promise<TicketCommerceMutationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "deactivate_event_ticket_zone_atomic",
    params: StagingDeactivateEventTicketZoneArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "deactivate_event_ticket_zone_atomic",
    args
  );

  if (error) return { ok: false, reason: "rpc_failed" };
  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    return {
      ok: false,
      reason: (payload.error_code ?? "mutation_failed").toLowerCase(),
    };
  }
  return {
    ok: true,
    id: typeof payload.zone_id === "string" ? payload.zone_id : undefined,
  };
}

export async function upsertOrganizerEventTicketType(
  args: StagingUpsertEventTicketTypeArgs
): Promise<TicketCommerceMutationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "upsert_event_ticket_type",
    params: StagingUpsertEventTicketTypeArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "upsert_event_ticket_type",
    args
  );

  if (error) return { ok: false, reason: "rpc_failed" };
  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    return {
      ok: false,
      reason: (payload.error_code ?? "mutation_failed").toLowerCase(),
    };
  }
  return {
    ok: true,
    id:
      typeof payload.ticket_type_id === "string"
        ? payload.ticket_type_id
        : undefined,
  };
}
