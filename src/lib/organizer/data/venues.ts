import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizerVenueOption = {
  id: string;
  name: string;
  city: string | null;
  status: string;
};

type VenueListRow = {
  id: string;
  name: string;
  city: string | null;
  status: string;
};

/** Active venues owned by the organizer (RPC requires status = active). */
export async function listOrganizerActiveVenues(
  ownerId: string
): Promise<OrganizerVenueOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, city, status")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as unknown as VenueListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    status: String(row.status),
  }));
}
