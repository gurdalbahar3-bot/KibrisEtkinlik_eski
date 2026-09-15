import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_SEEDS,
  assertFixturesOnlyMode,
  getSourceSeedById,
  listEnabledSourceSeeds,
  matchSourceSeed,
} from "@/lib/orumcek/sources";

test("first-wave KKTC seeds include ticketing, municipalities, and universities", () => {
  const kinds = new Set(SOURCE_SEEDS.map((seed) => seed.kind));
  assert.deepEqual([...kinds].sort(), ["MUNICIPALITY", "TICKETING", "UNIVERSITY"]);
  assert.ok(SOURCE_SEEDS.length >= 12);
  assert.ok(SOURCE_SEEDS.every((seed) => seed.liveCrawl === false));
  assert.ok(SOURCE_SEEDS.every((seed) => seed.websiteUrl.startsWith("https://")));
});

test("named first-wave sources are present and matchable", () => {
  assert.ok(getSourceSeedById("gise-kibris"));
  assert.ok(getSourceSeedById("kibris-biletcim"));
  assert.ok(getSourceSeedById("ada-tickets"));
  assert.ok(getSourceSeedById("lefkosa-belediye"));
  assert.ok(getSourceSeedById("emu-dau"));

  const gise = matchSourceSeed("https://www.gisekibris.com/events/lefke-akustik-gece");
  assert.equal(gise?.id, "gise-kibris");
  assert.equal(listEnabledSourceSeeds().length, SOURCE_SEEDS.length);
});

test("live crawl env is refused in Sprint 1", () => {
  const previous = process.env.ORUMCEK_LIVE_CRAWL;
  process.env.ORUMCEK_LIVE_CRAWL = "1";
  try {
    assert.throws(() => assertFixturesOnlyMode(), /refuses live crawl/);
  } finally {
    if (previous === undefined) {
      delete process.env.ORUMCEK_LIVE_CRAWL;
    } else {
      process.env.ORUMCEK_LIVE_CRAWL = previous;
    }
  }
});
