import { createRawObservation } from "@/lib/orumcek/observation";
import type { PublisherRole, RawObservation } from "@/lib/orumcek/types";
import type { SpiderChannelKind } from "@/types/admin/raw-spider-event";

export function observation(input: {
  publisherId: string;
  channelId?: string;
  channelKind?: SpiderChannelKind;
  publisherRole?: PublisherRole;
  sourceUrl?: string;
  title?: string;
  district?: string;
  date?: string;
  time?: string;
  venue?: string;
  category?: string;
  description?: string;
  artist?: string;
  id?: string;
}): RawObservation {
  const channelKind = input.channelKind ?? "WEBSITE";
  const sourceUrl =
    input.sourceUrl ?? `https://example.com/${input.publisherId}/${input.channelId ?? "web"}`;

  return createRawObservation({
    id: input.id,
    publisherId: input.publisherId,
    channelId: input.channelId ?? `${input.publisherId}-${channelKind.toLowerCase()}`,
    channelKind,
    publisherRole: input.publisherRole,
    sourceUrl,
    raw: {
      rawTitle: input.title ?? "Lefke Akustik Gece",
      rawDescription: input.description ?? "Gemikonagi sahilinde akustik performans.",
      rawDate: input.date ?? "2026-08-20",
      rawTime: input.time ?? "20:00",
      rawVenue: input.venue ?? "Gemikonagi Sahil",
      rawDistrict: input.district ?? "Lefke",
      rawCategory: input.category ?? "concert",
      rawArtist: input.artist ?? "Local Acoustic Collective",
    },
  });
}

export function fourIndependentObservations(
  overrides?: Partial<Parameters<typeof observation>[0]>
): RawObservation[] {
  return ["venue-lefke", "gazete-kibris", "radyo-guzelyurt", "belediye-lefke"].map(
    (publisherId, index) =>
      observation({
        publisherId,
        channelId: `${publisherId}-web`,
        sourceUrl: `https://example.com/${publisherId}/event`,
        ...overrides,
        id: overrides?.id ? `${overrides.id}-${index}` : undefined,
      })
  );
}
