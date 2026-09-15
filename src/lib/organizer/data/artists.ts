import {
  parseOrganizerRpcJson,
  type StagingSetEventArtistsArgs,
  type StagingUpsertArtistArgs,
} from "@/lib/organizer/rpc";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase/database";

export type OrganizerArtistCatalogItem = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizerEventArtistLink = {
  artistId: string;
  name: string;
  slug: string;
  role: string;
  sortOrder: number;
};

export type OrganizerEventArtistsBundle = {
  catalog: OrganizerArtistCatalogItem[];
  attached: OrganizerEventArtistLink[];
};

type ArtistRow = {
  id: string;
  name: string;
  slug: string;
};

type EventArtistRow = {
  artist_id: string;
  role: string | null;
  sort_order: number | null;
  artists: ArtistRow | ArtistRow[] | null;
};

/** Metadata/artist tables are staging-live but omitted from hand-maintained Database Tables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedFrom = (table: string) => any;

function unwrapArtist(artists: EventArtistRow["artists"]): ArtistRow | null {
  if (!artists) return null;
  if (Array.isArray(artists)) return artists[0] ?? null;
  return artists;
}

/**
 * Authenticated server read via RLS SELECT:
 * - artists: is_active OR is_super_admin
 * - event_artists: published OR can_manage_event
 */
export async function getOrganizerEventArtists(
  eventId: string
): Promise<OrganizerEventArtistsBundle> {
  const supabase = await createSupabaseServerClient();
  const from = supabase.from.bind(supabase) as UntypedFrom;

  const [catalogRes, attachedRes] = await Promise.all([
    from("artists")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500),
    from("event_artists")
      .select("artist_id, role, sort_order, artists ( id, name, slug )")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
  ]);

  const catalog = catalogRes.error
    ? []
    : ((catalogRes.data ?? []) as unknown as ArtistRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      }));

  const attached = attachedRes.error
    ? []
    : ((attachedRes.data ?? []) as unknown as EventArtistRow[])
        .map((row, index) => {
          const artist = unwrapArtist(row.artists);
          if (!artist) return null;
          return {
            artistId: row.artist_id,
            name: artist.name,
            slug: artist.slug,
            role: row.role?.trim() || "performer",
            sortOrder:
              typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
                ? row.sort_order
                : index,
          } satisfies OrganizerEventArtistLink;
        })
        .filter((row): row is OrganizerEventArtistLink => row !== null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return { catalog, attached };
}

export type UpsertOrganizerArtistResult =
  | { ok: true; artist: OrganizerArtistCatalogItem; created: boolean }
  | { ok: false; reason: string };

export async function upsertOrganizerArtist(
  args: StagingUpsertArtistArgs
): Promise<UpsertOrganizerArtistResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "upsert_artist_atomic",
    params: StagingUpsertArtistArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "upsert_artist_atomic",
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

  const artistId =
    typeof payload.artist_id === "string" ? payload.artist_id : null;
  const slug = typeof payload.slug === "string" ? payload.slug : null;
  if (!artistId || !slug) {
    return { ok: false, reason: "mutation_failed" };
  }

  return {
    ok: true,
    created: payload.created === true,
    artist: {
      id: artistId,
      name: args.p_name.trim(),
      slug,
    },
  };
}

export type SetOrganizerEventArtistsResult =
  | { ok: true; count: number }
  | { ok: false; reason: string };

export async function setOrganizerEventArtists(
  args: StagingSetEventArtistsArgs
): Promise<SetOrganizerEventArtistsResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as unknown as (
    name: "set_event_artists_atomic",
    params: StagingSetEventArtistsArgs
  ) => Promise<{ data: Json | null; error: { message: string } | null }>)(
    "set_event_artists_atomic",
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

  const count = typeof payload.count === "number" ? payload.count : 0;
  return { ok: true, count };
}
