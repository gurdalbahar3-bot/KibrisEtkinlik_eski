import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_SEEDS,
  LIVE_CRAWL_ALLOWLIST,
  PRIMARY_LIVE_CRAWL_SOURCE_ID,
  getSourceSeedById,
  listEnabledSourceSeeds,
  matchSourceSeed,
} from "@/lib/orumcek/sources";
import { evaluateLiveCrawlGate, isLiveCrawlFlagOn } from "@/lib/orumcek/crawl-gate";

function withLiveCrawlEnv(flag: string | undefined, fn: () => void): void {
  const previous = process.env.ORUMCEK_LIVE_CRAWL;
  if (flag === undefined) {
    delete process.env.ORUMCEK_LIVE_CRAWL;
  } else {
    process.env.ORUMCEK_LIVE_CRAWL = flag;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.ORUMCEK_LIVE_CRAWL;
    } else {
      process.env.ORUMCEK_LIVE_CRAWL = previous;
    }
  }
}

test("first-wave KKTC seeds include ticketing, municipalities, and universities", () => {
  const kinds = new Set(SOURCE_SEEDS.map((seed) => seed.kind));
  assert.deepEqual([...kinds].sort(), ["MUNICIPALITY", "TICKETING", "UNIVERSITY"]);
  assert.ok(SOURCE_SEEDS.length >= 12);
  assert.ok(SOURCE_SEEDS.every((seed) => seed.liveCrawl === false));
  assert.ok(SOURCE_SEEDS.every((seed) => seed.websiteUrl.startsWith("https://")));
});

test("named first-wave sources are present and matchable including www-less hosts", () => {
  assert.ok(getSourceSeedById("gise-kibris"));
  assert.ok(getSourceSeedById("kibris-biletcim"));
  assert.ok(getSourceSeedById("ada-tickets"));
  assert.ok(getSourceSeedById("lefkosa-belediye"));
  assert.ok(getSourceSeedById("emu-dau"));

  const gise = matchSourceSeed("https://www.gisekibris.com/events/lefke-akustik-gece");
  assert.equal(gise?.id, "gise-kibris");
  const biletcim = matchSourceSeed("https://kibrisbiletcim.com/tr/etkinlikler/zengin-mutfagi");
  assert.equal(biletcim?.id, "kibris-biletcim");
  assert.equal(listEnabledSourceSeeds().length, SOURCE_SEEDS.length);
});

test("Sprint 2 allowlist is a single primary source and seeds stay liveCrawl false", () => {
  assert.deepEqual([...LIVE_CRAWL_ALLOWLIST], ["kibris-biletcim"]);
  assert.equal(PRIMARY_LIVE_CRAWL_SOURCE_ID, "kibris-biletcim");
  assert.equal(getSourceSeedById("kibris-biletcim")?.liveCrawl, false);
});

test("live crawl env is refused unless flag and allowlisted source are both set", () => {
  withLiveCrawlEnv(undefined, () => {
    assert.equal(isLiveCrawlFlagOn(), false);
    const gate = evaluateLiveCrawlGate("kibris-biletcim");
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.code, "LIVE_CRAWL_DISABLED");
    }
  });

  withLiveCrawlEnv("1", () => {
    assert.equal(isLiveCrawlFlagOn(), true);
    const allowed = evaluateLiveCrawlGate("kibris-biletcim");
    assert.equal(allowed.ok, true);

    const refused = evaluateLiveCrawlGate("gise-kibris");
    assert.equal(refused.ok, false);
    if (!refused.ok) {
      assert.equal(refused.code, "SOURCE_NOT_ALLOWLISTED");
    }

    const unknown = evaluateLiveCrawlGate("not-a-source");
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.equal(unknown.code, "SOURCE_UNKNOWN");
    }
  });
});
