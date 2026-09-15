"use client";

import { useMemo, useState } from "react";

import {
  createOrganizerArtistAction,
  setOrganizerEventArtistsAction,
} from "@/app/organizer/(app)/events/actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import type {
  OrganizerArtistCatalogItem,
  OrganizerEventArtistLink,
} from "@/lib/organizer/data/artists";

export type EventArtistsPanelLabels = {
  title: string;
  subtitle: string;
  saved: string;
  readOnlyHint: string;
  empty: string;
  searchLabel: string;
  searchPlaceholder: string;
  add: string;
  createTitle: string;
  fieldName: string;
  fieldSlug: string;
  fieldBio: string;
  fieldImageUrl: string;
  createSubmit: string;
  createPending: string;
  fieldRole: string;
  rolePlaceholder: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  save: string;
  saving: string;
  alreadyAttached: string;
  noSearchResults: string;
  errUnauthenticated: string;
  errForbidden: string;
  errNameRequired: string;
  errSlugRequired: string;
  errSlugConflict: string;
  errArtistNotFound: string;
  errArtistInactive: string;
  errInvalidArtists: string;
  errDuplicateArtist: string;
  errNotDraft: string;
  errEventNotFound: string;
  errSaveFailed: string;
  errCreateFailed: string;
};

type Props = {
  eventId: string;
  isDraft: boolean;
  catalog: OrganizerArtistCatalogItem[];
  attached: OrganizerEventArtistLink[];
  labels: EventArtistsPanelLabels;
  artistsOk: boolean;
  artistsError: string | null;
};

type LocalArtist = {
  artistId: string;
  name: string;
  slug: string;
  role: string;
};

function mapArtistsError(
  error: string | null,
  labels: EventArtistsPanelLabels
): string | null {
  if (!error) return null;
  switch (error) {
    case "unauthenticated":
      return labels.errUnauthenticated;
    case "forbidden":
      return labels.errForbidden;
    case "name_required":
      return labels.errNameRequired;
    case "slug_required":
      return labels.errSlugRequired;
    case "slug_conflict":
      return labels.errSlugConflict;
    case "artist_not_found":
      return labels.errArtistNotFound;
    case "artist_inactive":
      return labels.errArtistInactive;
    case "invalid_artists":
      return labels.errInvalidArtists;
    case "duplicate_artist":
      return labels.errDuplicateArtist;
    case "not_draft":
      return labels.errNotDraft;
    case "not_found":
    case "event_not_found":
      return labels.errEventNotFound;
    default:
      return labels.errSaveFailed;
  }
}

function mapCreateError(
  error: string | null,
  labels: EventArtistsPanelLabels
): string | null {
  if (!error) return null;
  switch (error) {
    case "unauthenticated":
      return labels.errUnauthenticated;
    case "forbidden":
      return labels.errForbidden;
    case "name_required":
      return labels.errNameRequired;
    case "slug_required":
      return labels.errSlugRequired;
    case "slug_conflict":
      return labels.errSlugConflict;
    case "not_draft":
      return labels.errNotDraft;
    case "not_found":
    case "event_not_found":
      return labels.errEventNotFound;
    default:
      return labels.errCreateFailed;
  }
}

export function EventArtistsPanel({
  eventId,
  isDraft,
  catalog,
  attached,
  labels,
  artistsOk,
  artistsError,
}: Props) {
  const [localCatalog, setLocalCatalog] = useState(catalog);
  const [items, setItems] = useState<LocalArtist[]>(() =>
    attached.map((row) => ({
      artistId: row.artistId,
      name: row.name,
      slug: row.slug,
      role: row.role || "performer",
    }))
  );
  const [query, setQuery] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const feedbackError = mapArtistsError(artistsError, labels);
  const createErrorMessage = mapCreateError(createError, labels);

  const attachedIds = useMemo(
    () => new Set(items.map((item) => item.artistId.toLowerCase())),
    [items]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return localCatalog
      .filter((artist) => artist.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [localCatalog, query]);

  const payloadJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item, index) => ({
          artist_id: item.artistId,
          role: item.role.trim() || "performer",
          sort_order: index,
        }))
      ),
    [items]
  );

  function addArtist(artist: OrganizerArtistCatalogItem) {
    if (attachedIds.has(artist.id.toLowerCase())) return;
    setItems((prev) => [
      ...prev,
      {
        artistId: artist.id,
        name: artist.name,
        slug: artist.slug,
        role: "performer",
      },
    ]);
    setQuery("");
  }

  function removeAt(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function updateRole(index: number, role: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, role } : item))
    );
  }

  async function onCreateSubmit(formData: FormData) {
    setCreateError(null);
    setCreatePending(true);
    try {
      const result = await createOrganizerArtistAction(formData);
      if (!result.ok) {
        setCreateError(result.reason);
        return;
      }
      setLocalCatalog((prev) => {
        if (prev.some((row) => row.id === result.artist.id)) return prev;
        return [...prev, result.artist].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });
      setItems((prev) => {
        if (prev.some((row) => row.artistId === result.artist.id)) return prev;
        return [
          ...prev,
          {
            artistId: result.artist.id,
            name: result.artist.name,
            slug: result.artist.slug,
            role: "performer",
          },
        ];
      });
      (
        document.getElementById("artist_create_form") as HTMLFormElement | null
      )?.reset();
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="event-artists-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-600">{labels.subtitle}</p>
      </div>

      {artistsOk ? (
        <p
          className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900"
          role="status"
          data-testid="event-artists-saved"
        >
          {labels.saved}
        </p>
      ) : null}
      {feedbackError ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="event-artists-error"
        >
          {feedbackError}
        </p>
      ) : null}
      {createErrorMessage ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="event-artists-create-error"
        >
          {createErrorMessage}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="event-artists-empty">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-3" data-testid="event-artists-list">
          {items.map((item, index) => (
            <li
              key={item.artistId}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              data-testid="event-artist-row"
              data-artist-id={item.artistId}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900" data-testid="event-artist-name">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-500">{item.slug}</p>
                </div>
                {isDraft ? (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      data-testid="event-artist-move-up"
                    >
                      {labels.moveUp}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      data-testid="event-artist-move-down"
                    >
                      {labels.moveDown}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950"
                      onClick={() => removeAt(index)}
                      data-testid="event-artist-remove"
                    >
                      {labels.remove}
                    </button>
                  </div>
                ) : null}
              </div>
              {isDraft ? (
                <div className="mt-2">
                  <label
                    htmlFor={`artist_role_${item.artistId}`}
                    className="block text-xs font-medium text-slate-600"
                  >
                    {labels.fieldRole}
                  </label>
                  <input
                    id={`artist_role_${item.artistId}`}
                    type="text"
                    value={item.role}
                    onChange={(e) => updateRole(index, e.target.value)}
                    placeholder={labels.rolePlaceholder}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    data-testid="event-artist-role"
                  />
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600" data-testid="event-artist-role-readonly">
                  {labels.fieldRole}: {item.role}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {isDraft ? (
        <>
          <div className="space-y-2" data-testid="event-artists-search">
            <label
              htmlFor="artist_search"
              className="block text-sm font-medium text-slate-700"
            >
              {labels.searchLabel}
            </label>
            <input
              id="artist_search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              data-testid="event-artists-search-input"
            />
            {query.trim() ? (
              searchResults.length === 0 ? (
                <p className="text-xs text-slate-500">{labels.noSearchResults}</p>
              ) : (
                <ul className="space-y-1" data-testid="event-artists-search-results">
                  {searchResults.map((artist) => {
                    const already = attachedIds.has(artist.id.toLowerCase());
                    return (
                      <li
                        key={artist.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <span>
                          {artist.name}{" "}
                          <span className="text-xs text-slate-500">({artist.slug})</span>
                        </span>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => addArtist(artist)}
                          className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900 disabled:opacity-50"
                          data-testid="event-artists-add"
                        >
                          {already ? labels.alreadyAttached : labels.add}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </div>

          <form
            id="artist_create_form"
            action={onCreateSubmit}
            className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4"
            data-testid="event-artists-create-form"
          >
            <h4 className="text-sm font-semibold text-slate-900">{labels.createTitle}</h4>
            <input type="hidden" name="event_id" value={eventId} />
            <div>
              <label htmlFor="artist_name" className="block text-sm font-medium text-slate-700">
                {labels.fieldName} *
              </label>
              <input
                id="artist_name"
                name="name"
                type="text"
                required
                maxLength={200}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="event-artist-create-name"
              />
            </div>
            <div>
              <label htmlFor="artist_slug" className="block text-sm font-medium text-slate-700">
                {labels.fieldSlug}
              </label>
              <input
                id="artist_slug"
                name="slug"
                type="text"
                maxLength={120}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="event-artist-create-slug"
              />
            </div>
            <div>
              <label htmlFor="artist_bio" className="block text-sm font-medium text-slate-700">
                {labels.fieldBio}
              </label>
              <textarea
                id="artist_bio"
                name="bio"
                rows={2}
                maxLength={2000}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="event-artist-create-bio"
              />
            </div>
            <div>
              <label
                htmlFor="artist_image_url"
                className="block text-sm font-medium text-slate-700"
              >
                {labels.fieldImageUrl}
              </label>
              <input
                id="artist_image_url"
                name="image_url"
                type="url"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                data-testid="event-artist-create-image"
              />
            </div>
            <button
              type="submit"
              disabled={createPending}
              aria-busy={createPending}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-60"
              data-testid="event-artist-create-submit"
            >
              {createPending ? labels.createPending : labels.createSubmit}
            </button>
          </form>

          <form
            action={setOrganizerEventArtistsAction}
            className="space-y-2"
            data-testid="event-artists-save-form"
          >
            <input type="hidden" name="event_id" value={eventId} />
            <input type="hidden" name="artists_json" value={payloadJson} />
            <OrganizerSubmitButton
              label={labels.save}
              pendingLabel={labels.saving}
              variant="secondary"
            />
          </form>
        </>
      ) : (
        <div data-testid="event-artists-readonly">
          <p className="text-xs text-slate-500">{labels.readOnlyHint}</p>
        </div>
      )}
    </section>
  );
}
