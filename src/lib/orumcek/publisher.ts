import type { Publisher, PublisherChannel, PublisherRole, SourceSeed } from "@/lib/orumcek/types";
import type { SpiderChannelKind } from "@/types/admin/raw-spider-event";

/** Unique publisher identities — URLs and channels are not independent sources. */
export function uniquePublisherIds(publisherIds: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const id of publisherIds) {
    const trimmed = id.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

export function countIndependentPublishers(
  observations: Array<{ publisherId: string }>
): number {
  return uniquePublisherIds(observations.map((item) => item.publisherId)).length;
}

export function createPublisher(
  id: string,
  name: string,
  role: PublisherRole = "PUBLISHER"
): Publisher {
  return { id, name, role };
}

export function createPublisherChannel(
  id: string,
  publisherId: string,
  kind: SpiderChannelKind,
  url: string,
  label?: string
): PublisherChannel {
  return { id, publisherId, kind, url, label };
}

export function createSourceSeed(
  id: string,
  publisher: Publisher,
  channels: PublisherChannel[],
  enabled = true
): SourceSeed {
  const mismatched = channels.find((channel) => channel.publisherId !== publisher.id);
  if (mismatched) {
    throw new Error(
      `Channel ${mismatched.id} belongs to ${mismatched.publisherId}, not ${publisher.id}.`
    );
  }
  return { id, publisher, channels, enabled };
}
