import assert from "node:assert/strict";
import test from "node:test";
import { eventToJsonLd } from "../src/lib/seo/jsonld.ts";

const TICKET_URL = "https://tickets.kibrisetkinlik.com/girne-yaz";

const catalog = [
  {
    id: "t1-std",
    name: "Genel Giriş",
    zoneName: "Bahçe",
    zoneType: "standard",
    saleMode: "ticket_based",
    price: 450,
    remaining: 120,
    isSoldOut: false,
  },
  {
    id: "t1-vip",
    name: "VIP",
    zoneName: "Ön Sıra",
    zoneType: "front_row",
    saleMode: "ticket_based",
    price: 850,
    remaining: 18,
    isSoldOut: false,
  },
];

function sampleEvent(overrides = {}) {
  return {
    id: "1",
    title: "Girne Yaz Konseri",
    slug: "girne-yaz-konseri",
    poster: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3",
    date: "2026-08-24",
    startTime: "21:00",
    venue: "Bellapais Manastırı Açık Hava",
    venueSlug: "bellapais-manastiri",
    district: "girne",
    category: "concert",
    description: "Girne yaz konseri.",
    isFree: false,
    artist: "Kyrenia Live Band",
    artists: ["Kyrenia Live Band", "Guest DJ"],
    ...overrides,
  };
}

function emitted(value) {
  return JSON.parse(JSON.stringify(value));
}

test("JSON-LD offers.url is the real official ticket URL when present", () => {
  const jsonLd = emitted(
    eventToJsonLd(sampleEvent({ officialTicketUrl: TICKET_URL }), "en", "https://globaleventdiscovery.com", {
      ticketOffers: catalog,
    })
  );
  const offers = jsonLd.offers;
  assert.ok(Array.isArray(offers));
  assert.equal(offers.length, 2);
  for (const offer of offers) {
    assert.equal(offer.url, TICKET_URL);
    assert.equal(offer["@type"], "Offer");
  }
});

test("JSON-LD does not emit offers.url when official ticket URL is absent", () => {
  const jsonLd = emitted(
    eventToJsonLd(sampleEvent({ officialTicketUrl: undefined }), "tr", "https://globaleventdiscovery.com", {
      ticketOffers: catalog,
    })
  );
  const offers = jsonLd.offers;
  assert.ok(Array.isArray(offers));
  for (const offer of offers) {
    assert.equal(Object.hasOwn(offer, "url"), false);
  }
});

test("JSON-LD free-event Offer gets url only when official ticket URL exists", () => {
  const withUrl = emitted(
    eventToJsonLd(sampleEvent({ isFree: true, officialTicketUrl: TICKET_URL }), "en", "https://globaleventdiscovery.com")
  );
  assert.equal(withUrl.offers.url, TICKET_URL);
  assert.equal(withUrl.offers.price, "0");

  const withoutUrl = emitted(
    eventToJsonLd(sampleEvent({ isFree: true, officialTicketUrl: undefined }), "en", "https://globaleventdiscovery.com")
  );
  assert.equal(Object.hasOwn(withoutUrl.offers, "url"), false);
  assert.equal(withoutUrl.offers.price, "0");
});

test("JSON-LD does not invent a default/fake offers.url", () => {
  const jsonLd = emitted(
    eventToJsonLd(sampleEvent(), "en", "https://globaleventdiscovery.com", {
      ticketOffers: catalog,
    })
  );
  const offers = jsonLd.offers;
  assert.ok(Array.isArray(offers));
  assert.equal(offers.some((offer) => Object.hasOwn(offer, "url")), false);
  assert.equal(JSON.stringify(offers).includes("globaleventdiscovery.com"), false);
});

test("multi-artist JSON-LD performer stays the primary artist", () => {
  const jsonLd = emitted(
    eventToJsonLd(
      sampleEvent({
        artist: "Kyrenia Live Band",
        artists: ["Kyrenia Live Band", "Guest DJ"],
        officialTicketUrl: TICKET_URL,
      }),
      "tr",
      "https://globaleventdiscovery.com",
      { ticketOffers: catalog }
    )
  );
  assert.deepEqual(jsonLd.performer, {
    "@type": "PerformingGroup",
    name: "Kyrenia Live Band",
  });
  assert.equal(Object.hasOwn(jsonLd, "artists"), false);
});
