import { createSupabaseServerClient } from "@/lib/supabase/server";

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
};

export async function getOrganizerEvent(
  eventId: string,
  ownerId: string
): Promise<OrganizerEventDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, owner_id, venue_id, title, description, category, is_free, is_wedding, status, starts_at, ends_at, cover_image_url"
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
