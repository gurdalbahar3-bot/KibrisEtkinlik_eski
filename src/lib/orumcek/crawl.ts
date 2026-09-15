import { evaluateLiveCrawlGate, getRequestedCrawlSourceId } from "@/lib/orumcek/crawl-gate";
import { ingestRawSpiderEvent } from "@/lib/orumcek/ingest";
import {
  crawlKibrisBiletcim,
  KIBRIS_BILETCIM_LISTING_URL,
  KIBRIS_BILETCIM_SOURCE_ID,
} from "@/lib/orumcek/kibris-biletcim";
import { getSourceSeedById } from "@/lib/orumcek/sources";
import { recordOrumcekCrawlRun } from "@/lib/orumcek/store";
import type {
  LiveCrawlIngestResult,
  SpiderCrawlOptions,
  SpiderCrawlPort,
  SpiderIngestResult,
} from "@/lib/orumcek/types";

function newCrawlRunId(): string {
  return `crawl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class KibrisBiletcimCrawlAdapter implements SpiderCrawlPort {
  readonly sourceId = KIBRIS_BILETCIM_SOURCE_ID;

  async crawl(options: SpiderCrawlOptions = {}) {
    const parsed = await crawlKibrisBiletcim(options);
    return parsed.events;
  }
}

export const kibrisBiletcimCrawlAdapter = new KibrisBiletcimCrawlAdapter();

const ADAPTERS: Record<string, SpiderCrawlPort> = {
  [KIBRIS_BILETCIM_SOURCE_ID]: kibrisBiletcimCrawlAdapter,
};

/**
 * Gated single-source crawl → ingest. Never writes public `events`, never calls publish_event.
 */
export async function crawlAndIngestAllowlistedSource(
  sourceId = getRequestedCrawlSourceId(),
  options: SpiderCrawlOptions = {}
): Promise<LiveCrawlIngestResult> {
  const startedAt = options.now?.() ?? new Date().toISOString();
  const gate = evaluateLiveCrawlGate(sourceId);
  if (!gate.ok) {
    return { ...gate, wrotePublicEvent: false, publishCalled: false };
  }

  const adapter = ADAPTERS[sourceId];
  if (!adapter) {
    return {
      ok: false,
      code: "ADAPTER_MISSING",
      sourceId,
      message: `No crawl adapter registered for ${sourceId}.`,
      wrotePublicEvent: false,
      publishCalled: false,
    };
  }

  const crawlRunId = options.crawlRunId ?? newCrawlRunId();
  const parsed =
    sourceId === KIBRIS_BILETCIM_SOURCE_ID
      ? await crawlKibrisBiletcim({ ...options, crawlRunId })
      : { events: await adapter.crawl({ ...options, crawlRunId }), skipped: [] as { url: string; reason: string }[], pageFetches: 0, listingUrl: "" };

  const listingUrl = parsed.listingUrl || (sourceId === KIBRIS_BILETCIM_SOURCE_ID ? KIBRIS_BILETCIM_LISTING_URL : "");
  const results: SpiderIngestResult[] = [];
  const skipped = [...parsed.skipped];

  for (const raw of parsed.events) {
    try {
      results.push(ingestRawSpiderEvent(raw));
    } catch (error) {
      skipped.push({
        url: raw.sourceUrl,
        reason: error instanceof Error ? error.message : "ingest-failed",
      });
    }
  }

  const finishedAt = options.now?.() ?? new Date().toISOString();
  const ingested = results.filter((item) => !item.duplicate).length;
  const duplicates = results.filter((item) => item.duplicate).length;

  recordOrumcekCrawlRun({
    sourceId,
    sourceName: getSourceSeedById(sourceId)?.name ?? sourceId,
    listingUrl,
    startedAt,
    finishedAt,
    pageFetches: parsed.pageFetches,
    observationCount: parsed.events.length,
    ingested,
    duplicates,
    skipped: skipped.length,
    skipReasons: skipped.map((item) => `${item.url}: ${item.reason}`),
    wrotePublicEvent: false,
    publishCalled: false,
  });

  return {
    ok: true,
    sourceId,
    listingUrl,
    results,
    skipped,
    pageFetches: parsed.pageFetches,
    ingested,
    duplicates,
    wrotePublicEvent: false,
    publishCalled: false,
  };
}
