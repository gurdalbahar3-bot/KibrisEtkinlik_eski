import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseOrganizerRpcJson,
  type StagingSetEventOfficialTicketUrlArgs,
  type StagingUpdateEventDraftScheduleArgs,
} from "@/lib/organizer/rpc";
import type { Json } from "@/types/supabase/database";

export type OrganizerEventDetail = {
  id: string;
  ownerId: string;
  venueId: string;
  venueName: string | null;
  title: string;
  description: string | null;
  category: string;
  isFree: boolean;
  isWedding: boolean;
  status: string;
  startsAt: string;
  endsAt: string | null;
  coverImageUrl: string | null;
  officialTicketUrl: string | null;
};

type EventDetailRow = {
  id: string;
  owner_id: string;
  venue_id: string;
  title: string;
  description: string | null;
  category: string;
  is_free: boolean;
  is_wedding: boolean;
  status: string;
  starts_at: string;
  ends_at: string | null;
  cover_image_url: string | null;
  official_ticket_url: string | null;
};

export async function getOrganizerEvent(
  eventId: string,
  ownerId: string
): Promise<OrganizerEventDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, owner_id, venue_id, title, description, category, is_free, is_wedding, status, starts_at, ends_at, cover_image_url, official_ticket_url"
    )
    .eq("id", eventId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as EventDetailRow;

  const { data: venueRow } = await supabase
    .from("venues")
    .select("name")
    .eq("id", row.venue_id)
    .maybeSingle();

  const venueName =
    venueRow && typeof venueRow === "object" && "name" in venueRow
      ? String((venueRow as { name: string }).name)
      : null;

  return {
    id: row.id,
    ownerId: row.owner_id,
    venueId: row.venue_id,
    venueName,
    title: row.title,
    description: row.description,
    category: row.category,
    isFree: row.is_free,
    isWedding: row.is_wedding,
    status: String(row.status),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    coverImageUrl: row.cover_image_url,
    officialTicketUrl: row.official_ticket_url?.trim() || null,
  };
}

export type DraftEventUpdateInput = {
  title: string;
  description: string | null;
  category: string;
  isFree: boolean;
  isWedding: boolean;
  coverImageUrl: string | null;
};

/** Updates draft fields granted to authenticated owners (not status/starts_at/venue_id). */
export async function updateOrganizerDraftEvent(
  eventId: string,
  ownerId: string,
  input: DraftEventUpdateInput
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "update_failed"; message?: string }> {
  const supabase = await createSupabaseServerClient();
  const updatePayload = {
    title: input.title,
    description: input.description,
    category: input.category,
    is_free: input.isFree,
    is_wedding: input.isWedding,
    cover_image_url: input.coverImageUrl,
    updated_at: new Date().toISOString(),
  };

  // Hand-maintained Database Update typing collapses to never (same class as admin RPC casts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("events") as any)
    .update(updatePayload)
    .eq("id", eventId)
    .eq("owner_id", ownerId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "update_failed", message: String(error.message ?? "update_failed") };
  }
  if (!data) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}

export type SetOfficialTicketUrlResult =
  | { ok: true; url: string | null }
  | { ok: false; reason: string };

/** Calls staging set_event_official_ticket_url (no client column UPDATE). */
export async function setOrganizerOfficialTicketUrl(
  args: StagingSetEventOfficialTicketUrlArgs
): Promise<SetOfficialTicketUrlResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "set_event_official_ticket_url",
    params: StagingSetEventOfficialTicketUrlArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "set_event_official_ticket_url",
    args
  );

  if (error) {
    return { ok: false, reason: "rpc_failed" };
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    return {
      ok: false,
      reason: (payload.error_code ?? "mutation_failed").toLowerCase(),
    };
  }

  const url =
    typeof payload.official_ticket_url === "string"
      ? payload.official_ticket_url
      : payload.official_ticket_url === null
        ? null
        : null;

  return { ok: true, url };
}

export type DraftScheduleUpdateResult =
  | { ok: true }
  | { ok: false; reason: string };

/** P1.1A: draft-only starts_at/ends_at/venue_id via SECURITY DEFINER RPC (no column GRANT). */
export async function updateOrganizerDraftEventSchedule(
  args: StagingUpdateEventDraftScheduleArgs
): Promise<DraftScheduleUpdateResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "update_event_draft_schedule_atomic",
    params: StagingUpdateEventDraftScheduleArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "update_event_draft_schedule_atomic",
    args
  );

  if (error) {
    return { ok: false, reason: "rpc_failed" };
  }

  const payload = parseOrganizerRpcJson(data);
  if (!payload.success) {
    return {
      ok: false,
      reason: (payload.error_code ?? "schedule_update_failed").toLowerCase(),
    };
  }

  return { ok: true };
}

/** Cyprus wall-clock datetime-local value for draft editor inputs. */
export function isoToCyprusDatetimeLocal(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Nicosia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return iso.slice(0, 16);
  }
}
