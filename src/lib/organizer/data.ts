import { buildDeterministicSlug } from "@/lib/data/adapters/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

export type RpcResult = {
  success: boolean;
  error_code?: string;
  event_id?: string;
  zone_id?: string;
  ticket_type_id?: string;
  noop?: boolean;
};

function asRpcResult(data: Json | null): RpcResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, error_code: "INVALID_RPC_RESPONSE" };
  }
  const row = data as Record<string, unknown>;
  return {
    success: row.success === true,
    error_code: typeof row.error_code === "string" ? row.error_code : undefined,
    event_id: typeof row.event_id === "string" ? row.event_id : undefined,
    zone_id: typeof row.zone_id === "string" ? row.zone_id : undefined,
    ticket_type_id:
      typeof row.ticket_type_id === "string" ? row.ticket_type_id : undefined,
    noop: row.noop === true,
  };
}

export type OrganizerEventListItem = {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  category: string;
  is_free: boolean;
  venue_id: string;
  cover_image_url: string | null;
  venue_name: string | null;
  public_slug: string;
};

export type ActiveVenueOption = {
  id: string;
  name: string;
};

export async function listOrganizerEvents(): Promise<OrganizerEventListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, status, starts_at, ends_at, category, is_free, venue_id, cover_image_url, venues(name)"
    )
    .order("starts_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load organizer events: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const venues = row.venues as unknown as
      | { name: string }
      | { name: string }[]
      | null;
    const venueName = Array.isArray(venues)
      ? (venues[0]?.name ?? null)
      : (venues?.name ?? null);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      category: row.category,
      is_free: row.is_free,
      venue_id: row.venue_id,
      cover_image_url: row.cover_image_url,
      venue_name: venueName,
      public_slug: buildDeterministicSlug(row.title, row.id),
    };
  });
}

export async function listActiveVenues(): Promise<ActiveVenueOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, name")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load venues: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export async function getOrganizerEventById(eventId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, owner_id, title, description, category, is_free, is_wedding, status, starts_at, ends_at, cover_image_url, venue_id, venues(name)"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event: ${error.message}`);
  }
  return data;
}

export async function getEventTicketSetup(eventId: string) {
  const supabase = await createSupabaseServerClient();
  const [zonesRes, typesRes] = await Promise.all([
    supabase
      .from("event_ticket_zones")
      .select("id, name, zone_type, sale_mode, capacity, is_active")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("event_ticket_types")
      .select("id, zone_id, name, price, is_active")
      .eq("event_id", eventId),
  ]);

  if (zonesRes.error) {
    throw new Error(`Failed to load ticket zones: ${zonesRes.error.message}`);
  }
  if (typesRes.error) {
    throw new Error(`Failed to load ticket types: ${typesRes.error.message}`);
  }

  return { zones: zonesRes.data ?? [], types: typesRes.data ?? [] };
}

export async function rpcUpsertTicketZone(input: {
  eventId: string;
  name: string;
  capacity: number;
  zoneId?: string;
}): Promise<RpcResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_event_ticket_zone_atomic", {
    p_event_id: input.eventId,
    p_name: input.name,
    p_zone_type: "standard",
    p_sale_mode: "ticket_based",
    p_capacity: input.capacity,
    p_is_active: true,
    ...(input.zoneId ? { p_zone_id: input.zoneId } : {}),
  });
  if (error) {
    return { success: false, error_code: error.message };
  }
  return asRpcResult(data);
}

export async function rpcUpsertTicketType(input: {
  eventId: string;
  zoneId: string;
  name: string;
  price: number;
  ticketTypeId?: string;
}): Promise<RpcResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_event_ticket_type", {
    p_event_id: input.eventId,
    p_zone_id: input.zoneId,
    p_name: input.name,
    p_price: input.price,
    p_is_active: true,
    ...(input.ticketTypeId ? { p_ticket_type_id: input.ticketTypeId } : {}),
  });
  if (error) {
    return { success: false, error_code: error.message };
  }
  return asRpcResult(data);
}

export async function rpcPublishEvent(eventId: string): Promise<RpcResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_event", {
    p_event_id: eventId,
  });
  if (error) {
    return { success: false, error_code: error.message };
  }
  return asRpcResult(data);
}

/** Cyprus local wall-clock → ISO timestamptz (P0 uses +03:00). */
export function cyprusLocalInputToIso(localValue: string): string {
  const normalized = localValue.length === 16 ? `${localValue}:00` : localValue;
  return new Date(`${normalized}+03:00`).toISOString();
}
