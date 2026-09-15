import assert from "node:assert/strict";
import test from "node:test";

import { crawlAndIngestAllowlistedSource } from "@/lib/orumcek/crawl";
import { ingestRawSpiderEvent } from "@/lib/orumcek/ingest";
import { KIBRIS_BILETCIM_LISTING_URL } from "@/lib/orumcek/kibris-biletcim";
import { getLastOrumcekCrawlRun, listDrafts, listObservations, resetOrumcekStore } from "@/lib/orumcek/store";
import type { CrawlFetchFn } from "@/lib/orumcek/types";
import { createEvidence } from "@/lib/admin/intake/evidence";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

function withLiveCrawlEnv<T>(flag: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.ORUMCEK_LIVE_CRAWL;
  if (flag === undefined) {
    delete process.env.ORUMCEK_LIVE_CRAWL;
  } else {
    process.env.ORUMCEK_LIVE_CRAWL = flag;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (previous === undefined) {
        delete process.env.ORUMCEK_LIVE_CRAWL;
      } else {
        process.env.ORUMCEK_LIVE_CRAWL = previous;
      }
    });
}

const ZENGIN_URL = "https://www.kibrisbiletcim.com/tr/etkinlikler/zengin-mutfagi";
const GECE_URL = "https://www.kibrisbiletcim.com/tr/etkinlikler/gece-yolculari-misirlizade-acik-hava-sahnesi";

const LISTING_HTML = `
<a href="/tr/etkinlikler/zengin-mutfagi">Zengin Mutfağı</a>
<a href="/tr/etkinlikler/gece-yolculari-misirlizade-acik-hava-sahnesi">Gece Yolcuları</a>
<a href="/tr/etkinlikler?category=CONCERT">Konser</a>
`;

const ZENGIN_HTML = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Event",
  name: "Zengin Mutfağı",
  description: "Tiyatro oyunu Mağusa'da.",
  startDate: "2026-09-26T17:30:00.000Z",
  location: { "@type": "Place", name: "Salamis Antik Tiyatro Mağusa" },
})}</script>`;

const GECE_HTML = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Event",
  name: "Gece Yolcuları | Mısırlızade Açık Hava Sahnesi",
  description: "Konser",
  startDate: "2026-10-02T19:00:00.000Z",
  location: { "@type": "Place", name: "Mısırlızade Sahnesi" },
})}</script>`;

function mockFetch(): CrawlFetchFn {
  const pages: Record<string, string> = {
    [KIBRIS_BILETCIM_LISTING_URL]: LISTING_HTML,
    [ZENGIN_URL]: ZENGIN_HTML,
    [GECE_URL]: GECE_HTML,
  };
  return async (url) => {
    const body = pages[url];
    if (!body) {
      return { url, status: 404, body: "" };
    }
    return { url, status: 200, body };
  };
}

function sampleRaw(overrides: Partial<RawSpiderEvent> = {}): RawSpiderEvent {
  return {
    sourceUrl: "https://www.gisekibris.com/events/lefke-akustik-gece",
    rawTitle: "Lefke Akustik Gece",
    rawDate: "2026-10-04",
    rawTime: "20:00",
    rawVenue: "Gemikonagi Sahil",
    rawDistrict: "Lefke",
    rawCategory: "concert",
    capturedAt: "2026-09-15T10:00:00.000Z",
    provenance: "FIXTURE",
    evidence: [
      createEvidence("JSON", "https://www.gisekibris.com/events/lefke-akustik-gece", "2026-09-15T10:00:00.000Z", "fixture"),
    ],
    ...overrides,
  };
}

test("live crawl refuses without ORUMCEK_LIVE_CRAWL=1 and does not fetch", async () => {
  resetOrumcekStore();
  let fetched = 0;
  const result = await withLiveCrawlEnv(undefined, () =>
    crawlAndIngestAllowlistedSource("kibris-biletcim", {
      fetchPage: async (url) => {
        fetched += 1;
        return { url, status: 200, body: LISTING_HTML };
      },
      delayMs: 0,
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "LIVE_CRAWL_DISABLED");
  }
  assert.equal(result.wrotePublicEvent, false);
  assert.equal(result.publishCalled, false);
  assert.equal(fetched, 0);
  assert.equal(listDrafts().length, 0);
});

test("live crawl refuses a source that is not on the allowlist even with the flag on", async () => {
  resetOrumcekStore();
  const result = await withLiveCrawlEnv("1", () =>
    crawlAndIngestAllowlistedSource("gise-kibris", {
      fetchPage: async () => {
        throw new Error("must not fetch non-allowlisted source");
      },
      delayMs: 0,
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "SOURCE_NOT_ALLOWLISTED");
  }
  assert.equal(result.wrotePublicEvent, false);
  assert.equal(result.publishCalled, false);
});

test("allowlisted crawl maps JSON-LD events into admin drafts without writing public events", async () => {
  resetOrumcekStore();
  const result = await withLiveCrawlEnv("1", () =>
    crawlAndIngestAllowlistedSource("kibris-biletcim", {
      fetchPage: mockFetch(),
      delayMs: 0,
      maxEvents: 2,
      now: () => "2026-09-15T12:00:00.000Z",
      crawlRunId: "crawl-test-1",
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.wrotePublicEvent, false);
  assert.equal(result.publishCalled, false);
  assert.equal(result.ingested, 2);
  assert.equal(result.duplicates, 0);
  assert.ok(result.results.every((item) => item.wrotePublicEvent === false));
  assert.ok(result.results.every((item) => item.draft.wrotePublicEvent === false));
  assert.ok(result.results.every((item) => item.draft.status === "PENDING_APPROVAL" || item.draft.status === "REVIEW"));
  assert.ok(result.results.every((item) => item.draft.provenance === "LIVE_CRAWL"));
  assert.ok(listDrafts().every((draft) => draft.wrotePublicEvent === false));
  assert.ok(listObservations().every((item) => item.provenance === "LIVE_CRAWL"));
  assert.ok(listDrafts().some((draft) => draft.draft.title === "Zengin Mutfağı"));
  assert.ok(listDrafts().some((draft) => draft.sourceSeedId === "kibris-biletcim"));

  const summary = getLastOrumcekCrawlRun();
  assert.equal(summary?.wrotePublicEvent, false);
  assert.equal(summary?.publishCalled, false);
  assert.equal(summary?.ingested, 2);
});

test("second identical crawl is idempotent and still does not publish", async () => {
  resetOrumcekStore();
  const options = {
    fetchPage: mockFetch(),
    delayMs: 0,
    maxEvents: 2,
    now: () => "2026-09-15T12:00:00.000Z",
  };

  await withLiveCrawlEnv("1", () => crawlAndIngestAllowlistedSource("kibris-biletcim", options));
  const second = await withLiveCrawlEnv("1", () => crawlAndIngestAllowlistedSource("kibris-biletcim", options));

  assert.equal(second.ok, true);
  if (!second.ok) {
    return;
  }
  assert.equal(second.duplicates, 2);
  assert.equal(second.ingested, 0);
  assert.equal(second.wrotePublicEvent, false);
  assert.equal(listDrafts().length, 2);
  assert.equal(listObservations().length, 2);
});

test("ingest still accepts fixtures while the live crawl flag is on", async () => {
  resetOrumcekStore();
  await withLiveCrawlEnv("1", () => {
    const result = ingestRawSpiderEvent(sampleRaw());
    assert.equal(result.wrotePublicEvent, false);
    assert.equal(result.draft.provenance, "FIXTURE");
    assert.ok(result.draft.status === "PENDING_APPROVAL" || result.draft.status === "REVIEW");
  });
});
