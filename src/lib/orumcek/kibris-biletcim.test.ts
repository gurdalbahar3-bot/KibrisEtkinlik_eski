import assert from "node:assert/strict";
import test from "node:test";

import { inferDistrictFromText } from "@/lib/orumcek/identity";
import {
  canonicalizeBiletcimEventUrl,
  decodeHtmlEntities,
  extractBiletcimEventUrls,
  extractSchemaEvents,
  guessBiletcimCategory,
  inferBiletcimDistrict,
  mapSchemaEventToRaw,
  parseBiletcimEventPage,
} from "@/lib/orumcek/kibris-biletcim";

const LISTING_HTML = `
<nav>
  <a href="/tr/etkinlikler">Etkinlikler</a>
  <a href="/tr/etkinlikler?category=CONCERT">Konser</a>
  <a href="/tr/etkinlik-yarat">Etkinlik Yarat</a>
</nav>
<a class="card" href="/tr/etkinlikler/zengin-mutfagi">Zengin Mutfağı</a>
<a href="https://kibrisbiletcim.com/tr/etkinlikler/gece-yolculari-misirlizade-acik-hava-sahnesi">Gece Yolcuları</a>
<a href="https://example.com/tr/etkinlikler/ignore-me">Other site</a>
`;

const EVENT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Zengin Mutfağı",
  description: "Tiyatro oyunu. &nbsp;KKTC'de ilk kez.",
  startDate: "2026-09-26T17:30:00.000Z",
  url: "https://kibrisbiletcim.com/tr/etkinlikler/zengin-mutfagi",
  location: {
    "@type": "Place",
    name: "Salamis Antik Tiyatro Mağusa",
    address: { "@type": "PostalAddress", streetAddress: "Salamis Yolu Harabeleri" },
  },
  performer: { "@type": "Person", name: "Şener Şen" },
};

function eventPageHtml(payload = EVENT_JSON_LD): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(payload)}</script></head><body>Zengin Mutfağı</body></html>`;
}

test("listing parser extracts canonical event URLs and ignores category/create links", () => {
  const urls = extractBiletcimEventUrls(LISTING_HTML);
  assert.deepEqual(urls, [
    "https://www.kibrisbiletcim.com/tr/etkinlikler/zengin-mutfagi",
    "https://www.kibrisbiletcim.com/tr/etkinlikler/gece-yolculari-misirlizade-acik-hava-sahnesi",
  ]);
  assert.equal(canonicalizeBiletcimEventUrl("/tr/etkinlikler?category=THEATER"), undefined);
  assert.equal(canonicalizeBiletcimEventUrl("/tr/etkinlik-yarat"), undefined);
});

test("JSON-LD Event maps to RawSpiderEvent with district, date, category, and live provenance", () => {
  const html = eventPageHtml();
  const schema = extractSchemaEvents(html);
  assert.equal(schema.length, 1);

  const mapped = mapSchemaEventToRaw(
    schema[0],
    "https://www.kibrisbiletcim.com/tr/etkinlikler/zengin-mutfagi",
    "2026-09-15T12:00:00.000Z",
    "crawl-test"
  );
  assert.ok(!("skip" in mapped));
  if ("skip" in mapped) {
    return;
  }
  assert.equal(mapped.rawTitle, "Zengin Mutfağı");
  assert.equal(mapped.rawDistrict, "gazimagusa");
  assert.equal(mapped.rawDate, "2026-09-26");
  assert.equal(mapped.rawTime, "17:30");
  assert.equal(mapped.rawVenue, "Salamis Antik Tiyatro Mağusa");
  assert.equal(mapped.rawCategory, "theater");
  assert.equal(mapped.rawArtist, "Şener Şen");
  assert.equal(mapped.provenance, "LIVE_CRAWL");
  assert.equal(mapped.crawlRunId, "crawl-test");
  assert.equal(mapped.evidence[0]?.type, "HTML");
  assert.match(mapped.rawDescription ?? "", /Tiyatro oyunu/);
});

test("parseBiletcimEventPage fails soft without JSON-LD Event", () => {
  const parsed = parseBiletcimEventPage("<html><body>no schema</body></html>", "https://www.kibrisbiletcim.com/tr/etkinlikler/x", "2026-09-15T12:00:00.000Z");
  assert.deepEqual(parsed, { skip: "missing-jsonld-event" });
});

test("district and category heuristics cover KKTC venues", () => {
  assert.equal(inferDistrictFromText("Salamis Antik Tiyatro Mağusa"), "gazimagusa");
  assert.equal(inferBiletcimDistrict(["Mısırlızade Açık Hava Sahnesi"]), "lefkosa");
  assert.equal(inferBiletcimDistrict(["Kaya Palazzo Resort & Casino, Girne"]), "girne");
  assert.equal(guessBiletcimCategory("Çakal Konseri"), "concert");
  assert.equal(guessBiletcimCategory("Kıbrıs Rakı Fest"), "festival");
});

test("HTML entities are decoded", () => {
  assert.equal(decodeHtmlEntities("Tiyatro&nbsp;oyunu &#x27;test&#x27;"), "Tiyatro oyunu 'test'");
});
