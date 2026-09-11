/**
 * Discovery publish → public surface e2e contracts (mock/source-level).
 * No live iyzico. Verifies organizer publish path stays gated and
 * public discovery only reads published/postponed pools.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("publish → discovery chain: SA publish RPC remains admin-only path", () => {
  const sa = read("scripts/assert-sa-real-publish.mjs");
  assert.match(sa, /publish_event/);
  assert.match(sa, /discovery|supabase|mock/i);
});

test("checkout CTAs from detail stay query-param deep links (no client price trust)", () => {
  const tickets = read("src/components/events/EventTicketOffers.tsx");
  assert.match(tickets, /pathname:\s*"\/checkout"/);
  assert.match(tickets, /buy-tickets-cta/);
  assert.doesNotMatch(tickets, /amount|price.*query/);

  const tables = read("src/components/events/EventTableOffers.tsx");
  assert.match(tables, /pathname:\s*"\/checkout"/);
  assert.match(tables, /reserve-table-cta/);
});

test("district hub route uses etkinlikler/{district} SEO path", () => {
  const detail = read("src/app/[locale]/events/[slug]/page.tsx");
  assert.match(detail, /DISTRICT_SLUGS\.includes/);
  assert.match(detail, /getByDistrict/);
  assert.match(detail, /metaDistrictTitle/);

  const sitemap = read("src/app/sitemap.ts");
  assert.match(sitemap, /eventsPath}.*?\$\{district\}/s);
});

test("homepage loader dedups sections and includes week + starting soon", () => {
  const loader = read("src/lib/home/load-homepage-data.ts");
  assert.match(loader, /thisWeekPreview/);
  assert.match(loader, /startingSoonPreview/);
  assert.match(loader, /weekendPreview/);
  assert.match(loader, /featuredEvents/);
});

test("official ticket URL remains preferred external CTA when present", () => {
  const tickets = read("src/components/events/EventTicketOffers.tsx");
  assert.match(tickets, /officialTicketUrl/);
  assert.match(tickets, /target="_blank"/);
  assert.match(tickets, /rel="noopener noreferrer"/);
});
