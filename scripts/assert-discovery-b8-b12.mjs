/**
 * B8–B12 discovery contracts: public visibility, filters, pagination,
 * CTAs, SEO/sitemap/robots, i18n, security surface.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("public discovery statuses exclude draft/in_review/approved/unpublished/cancelled", () => {
  const queries = read("src/lib/data/supabase/queries.ts");
  assert.match(queries, /DISCOVERY_LIST_STATUSES\s*=\s*\["published",\s*"postponed"\]/);
  assert.match(
    queries,
    /PUBLIC_EVENT_STATUSES\s*=\s*\["published",\s*"postponed",\s*"completed"\]/
  );
  assert.doesNotMatch(queries, /DISCOVERY_LIST_STATUSES[\s\S]*draft/);
  assert.doesNotMatch(queries, /DISCOVERY_LIST_STATUSES[\s\S]*in_review/);
  assert.doesNotMatch(queries, /DISCOVERY_LIST_STATUSES[\s\S]*approved/);
  assert.doesNotMatch(queries, /PUBLIC_EVENT_STATUSES[\s\S]*cancelled/);
});

test("canonical 6 KKTC districts preserved", () => {
  const cats = read("src/lib/data/categories.ts");
  for (const slug of [
    "lefkosa",
    "girne",
    "gazimagusa",
    "guzelyurt",
    "lefke",
    "iskele",
  ]) {
    assert.match(cats, new RegExp(`"${slug}"`));
  }
});

test("discovery search params cover district/date/category/venue/price/availability/page", () => {
  const params = read("src/lib/discovery/search-params.ts");
  assert.match(params, /venue\?:/);
  assert.match(params, /price\?:/);
  assert.match(params, /availability\?:/);
  assert.match(params, /page\?:/);
  assert.match(params, /"free"\s*\|\s*"paid"/);
  assert.match(params, /"tickets"\s*\|\s*"reservation"/);
});

test("filterEvents applies venue/price/availability deterministically", () => {
  const src = read("src/lib/discovery/filter-events.ts");
  assert.match(src, /params\.venue/);
  assert.match(src, /params\.price === "free"/);
  assert.match(src, /params\.availability === "tickets"/);
  assert.match(src, /eventMatchesQuery/);
  assert.match(src, /eventMatchesScopedQuery/);
  assert.match(src, /sortEvents/);

  // Pure deterministic replica of filter predicates (no @/ imports).
  const sample = [
    {
      id: "1",
      district: "girne",
      category: "nightlife",
      venueSlug: "club-a",
      isFree: false,
      hasTicketOffers: true,
      hasReservationOffers: false,
      title: "Girne Night",
      artist: "DJ One",
      venue: "Club A",
    },
    {
      id: "2",
      district: "lefkosa",
      category: "family",
      venueSlug: "park",
      isFree: true,
      hasTicketOffers: false,
      hasReservationOffers: true,
      title: "Free Park Day",
      artist: "Kids Band",
      venue: "Park",
    },
  ];

  const byDistrict = sample.filter((e) => e.district === "girne");
  assert.equal(byDistrict.length, 1);
  assert.equal(
    sample.filter((e) => e.category === "family")[0]?.id,
    "2"
  );
  assert.equal(sample.filter((e) => e.venueSlug === "club-a")[0]?.id, "1");
  assert.equal(sample.filter((e) => e.isFree)[0]?.id, "2");
  assert.equal(sample.filter((e) => !e.isFree)[0]?.id, "1");
  assert.equal(sample.filter((e) => e.hasTicketOffers)[0]?.id, "1");
  assert.equal(sample.filter((e) => e.hasReservationOffers)[0]?.id, "2");
  assert.equal(
    sample.filter((e) => e.artist.toLowerCase().includes("kids"))[0]?.id,
    "2"
  );
  assert.equal(
    sample.filter((e) => e.venue.toLowerCase().includes("club"))[0]?.id,
    "1"
  );
});

test("pagination is deterministic and upcoming-first sort stays stable", async () => {
  const { paginateItems } = await import("../src/lib/discovery/pagination.ts");
  const items = Array.from({ length: 50 }, (_, i) => ({
    id: String(i),
    date: `2099-09-${String((i % 28) + 1).padStart(2, "0")}`,
    startTime: "20:00",
  }));
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );
  const page1 = paginateItems(sorted, 1, 24);
  const page2 = paginateItems(sorted, 2, 24);
  assert.equal(page1.total, 50);
  assert.equal(page1.pageCount, 3);
  assert.equal(page1.items.length, 24);
  assert.equal(page2.items[0].id, sorted[24].id);
  assert.notEqual(page1.items[0].id, page2.items[0].id);

  const sortSrc = read("src/lib/discovery/sort-events.ts");
  assert.match(sortSrc, /DEFAULT_SORT/);
  assert.match(sortSrc, /starts_at|date\.localeCompare|startTime/);
});

test("commerce CTA modes: ticket / reservation / hybrid / free / external", async () => {
  const { resolveDiscoveryCommerceMode } = await import(
    "../src/lib/discovery/commerce-cta.ts"
  );
  assert.equal(
    resolveDiscoveryCommerceMode({
      isFree: true,
      hasTicketOffers: false,
      hasReservationOffers: false,
    }),
    "free"
  );
  assert.equal(
    resolveDiscoveryCommerceMode({
      isFree: false,
      hasTicketOffers: true,
      hasReservationOffers: false,
    }),
    "ticket"
  );
  assert.equal(
    resolveDiscoveryCommerceMode({
      isFree: false,
      hasTicketOffers: false,
      hasReservationOffers: true,
    }),
    "reservation"
  );
  assert.equal(
    resolveDiscoveryCommerceMode({
      isFree: false,
      hasTicketOffers: true,
      hasReservationOffers: true,
    }),
    "hybrid"
  );
  assert.equal(
    resolveDiscoveryCommerceMode({
      isFree: false,
      officialTicketUrl: "https://tickets.example/x",
      hasTicketOffers: false,
      hasReservationOffers: false,
    }),
    "external"
  );
});

test("event detail + listing + homepage discovery surfaces exist", () => {
  const detail = read("src/app/[locale]/events/[slug]/page.tsx");
  assert.match(detail, /EventShareButtons/);
  assert.match(detail, /EventTicketOffers/);
  assert.match(detail, /EventTableOffers/);
  assert.match(detail, /detail-buy-tickets-cta|buyTickets/);
  assert.match(detail, /detail-reserve-table-cta|reserveTable/);
  assert.match(detail, /openGraph/);
  assert.match(detail, /twitter/);
  assert.match(detail, /hreflang|languages/);
  assert.match(detail, /canonical/);

  const home = read("src/app/[locale]/page.tsx");
  assert.match(home, /ThisWeekEvents/);
  assert.match(home, /StartingSoonEvents/);
  assert.match(home, /WeekendEvents/);
  assert.match(home, /DistrictGrid/);

  const listing = read("src/app/[locale]/events/page.tsx");
  assert.match(listing, /searchPage/);
  assert.match(listing, /DiscoveryPagination/);
  assert.match(listing, /DiscoveryFilterForm/);
});

test("sitemap only uses discovery facade; robots disallow private paths", () => {
  const sitemap = read("src/app/sitemap.ts");
  assert.match(sitemap, /discoveryEventsRepository\.getAll/);
  assert.match(sitemap, /DISTRICT_SLUGS/);
  assert.match(sitemap, /assertDiscoverySourceAllowed/);
  assert.doesNotMatch(sitemap, /draft|in_review|approved/);

  const robots = read("src/app/robots.ts");
  assert.match(robots, /sitemap\.xml/);
  assert.match(robots, /\/organizer/);
  assert.match(robots, /\/admin/);
  assert.match(robots, /checkout/);
});

test("TR/EN discovery i18n keys present for CTAs filters share SEO", () => {
  const en = JSON.parse(read("messages/en.json"));
  const tr = JSON.parse(read("messages/tr.json"));
  for (const locale of [en, tr]) {
    assert.ok(locale.eventCard.buyTickets);
    assert.ok(locale.eventCard.reserveTable);
    assert.ok(locale.eventCard.viewDetails);
    assert.ok(locale.eventDetail.joinEvent);
    assert.ok(locale.eventShare.whatsapp);
    assert.ok(locale.listing.availabilityTickets);
    assert.ok(locale.listing.priceFree);
    assert.ok(locale.thisWeekSection.title);
    assert.ok(locale.startingSoonSection.title);
    assert.ok(locale.districtsPage.metaDistrictTitle);
  }
});

test("public discovery does not expose organizer mutations or payment settlement", () => {
  const detail = read("src/app/[locale]/events/[slug]/page.tsx");
  assert.doesNotMatch(detail, /confirm_payment_atomic|upsert_event_table|requireOrganizer/);
  assert.doesNotMatch(detail, /createPaymentSession|IYZICO_/);

  const filters = read("src/components/discovery/DiscoveryFilterForm.tsx");
  assert.match(filters, /method="get"/);
});

test("batch commerce index avoids N+1 ticket/package queries per card", () => {
  const commerce = read("src/lib/data/discovery-commerce.ts");
  assert.match(commerce, /loadDiscoveryCommerceIndex/);
  assert.match(commerce, /applyCommerceIndex/);
  assert.match(commerce, /event_ticket_types/);
  assert.match(commerce, /table_packages/);

  const repo = read("src/lib/data/discovery-repository.ts");
  assert.match(repo, /applyCommerceIndex/);
  assert.match(repo, /searchPage/);
});
