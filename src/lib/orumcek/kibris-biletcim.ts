import { createEvidence } from "@/lib/admin/intake/evidence";
import { inferDistrictFromText } from "@/lib/orumcek/identity";
import type { CrawlFetchFn, CrawlSkip, SpiderCrawlOptions } from "@/lib/orumcek/types";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";
import type { DistrictSlug, EventCategory } from "@/types/event";
import { defaultCrawlFetch, delay, DEFAULT_DETAIL_DELAY_MS, DEFAULT_MAX_EVENTS } from "@/lib/orumcek/crawl-http";

export const KIBRIS_BILETCIM_SOURCE_ID = "kibris-biletcim";
export const KIBRIS_BILETCIM_ORIGIN = "https://www.kibrisbiletcim.com";
export const KIBRIS_BILETCIM_LISTING_URL = `${KIBRIS_BILETCIM_ORIGIN}/tr/etkinlikler`;

const EVENT_PATH = /^\/tr\/etkinlikler\/([a-z0-9-]+)\/?$/i;

const VENUE_DISTRICT_HINTS: Array<{ pattern: RegExp; district: DistrictSlug }> = [
  { pattern: /mısırlızade|misirlizade|akk m|akkm|yakın doğu|yakin dogu|\bydü\b|\bydu\b/i, district: "lefkosa" },
  { pattern: /salamis|daü|dau|\bemu\b|antik tiyatro/i, district: "gazimagusa" },
  { pattern: /kaya palazzo|cratos|elexus|kyrenia/i, district: "girne" },
];

const CATEGORY_HINTS: Array<{ pattern: RegExp; category: EventCategory }> = [
  { pattern: /konser|concert|akustik/i, category: "concert" },
  { pattern: /festival|fest\b/i, category: "festival" },
  { pattern: /tiyatro|theater|theatre/i, category: "theater" },
  { pattern: /stand-?up|komedi/i, category: "standup" },
  { pattern: /club|parti|party|lounge/i, category: "nightlife" },
  { pattern: /çocuk|cocuk|kids|aile/i, category: "family" },
];

export interface BiletcimParseResult {
  events: RawSpiderEvent[];
  skipped: CrawlSkip[];
  pageFetches: number;
  listingUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    const raw = match[1]?.trim();
    if (raw) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        // Fail soft: skip malformed JSON-LD.
      }
    }
    match = pattern.exec(html);
  }
  return blocks;
}

function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectNodes(item, out);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  out.push(node);
  if ("@graph" in node) {
    collectNodes(node["@graph"], out);
  }
}

export function extractSchemaEvents(html: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    const nodes: Record<string, unknown>[] = [];
    collectNodes(block, nodes);
    for (const node of nodes) {
      const types = asArray(node["@type"]).map(String);
      if (types.includes("Event")) {
        events.push(node);
      }
    }
  }
  return events;
}

export function canonicalizeBiletcimEventUrl(href: string, origin = KIBRIS_BILETCIM_ORIGIN): string | undefined {
  let pathname = href.trim();
  if (!pathname) {
    return undefined;
  }

  if (/^https?:\/\//i.test(pathname)) {
    try {
      const parsed = new URL(pathname);
      const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "kibrisbiletcim.com") {
        return undefined;
      }
      pathname = parsed.pathname;
    } catch {
      return undefined;
    }
  }

  const match = pathname.match(EVENT_PATH);
  if (!match) {
    return undefined;
  }
  const slug = match[1].toLowerCase();
  if (slug === "etkinlik-yarat") {
    return undefined;
  }
  return `${origin}/tr/etkinlikler/${slug}`;
}

export function extractBiletcimEventUrls(html: string, origin = KIBRIS_BILETCIM_ORIGIN): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const pattern = /href=["']([^"']+)["']/gi;
  let match = pattern.exec(html);
  while (match) {
    const canonical = canonicalizeBiletcimEventUrl(match[1], origin);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      urls.push(canonical);
    }
    match = pattern.exec(html);
  }
  return urls;
}

export function inferBiletcimDistrict(parts: Array<string | undefined>): DistrictSlug | undefined {
  const joined = parts.filter(Boolean).join(" ");
  const fromText = inferDistrictFromText(joined);
  if (fromText) {
    return fromText;
  }
  for (const hint of VENUE_DISTRICT_HINTS) {
    if (hint.pattern.test(joined)) {
      return hint.district;
    }
  }
  return undefined;
}

export function guessBiletcimCategory(...parts: Array<string | undefined>): EventCategory | undefined {
  const joined = parts.filter(Boolean).join(" ");
  for (const hint of CATEGORY_HINTS) {
    if (hint.pattern.test(joined)) {
      return hint.category;
    }
  }
  return undefined;
}

function performerName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return decodeHtmlEntities(value);
  }
  if (isRecord(value) && typeof value.name === "string") {
    return decodeHtmlEntities(value.name) || undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    return performerName(value[0]);
  }
  return undefined;
}

export function mapSchemaEventToRaw(
  event: Record<string, unknown>,
  pageUrl: string,
  capturedAt: string,
  crawlRunId?: string
): RawSpiderEvent | { skip: string } {
  const title = decodeHtmlEntities(String(event.name ?? ""));
  if (!title) {
    return { skip: "missing-title" };
  }

  const location = isRecord(event.location) ? event.location : {};
  const venue = decodeHtmlEntities(String(location.name ?? "")) || undefined;
  const address = isRecord(location.address) ? location.address : {};
  const street = decodeHtmlEntities(String(address.streetAddress ?? ""));
  const locality = decodeHtmlEntities(String(address.addressLocality ?? ""));
  const description = decodeHtmlEntities(String(event.description ?? "")) || undefined;
  const district = inferBiletcimDistrict([locality, venue, street, title, description]);
  if (!district) {
    return { skip: "unresolved-district" };
  }

  const start = String(event.startDate ?? "");
  const dateMatch = start.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);

  return {
    sourceUrl: pageUrl,
    rawTitle: title,
    rawDescription: description,
    rawDate: dateMatch?.[1],
    rawTime: dateMatch?.[2],
    rawVenue: venue,
    rawDistrict: district,
    rawCategory: guessBiletcimCategory(title, description, venue),
    rawArtist: performerName(event.performer),
    capturedAt,
    provenance: "LIVE_CRAWL",
    crawlRunId,
    evidence: [
      createEvidence(
        "HTML",
        pageUrl,
        capturedAt,
        JSON.stringify({
          name: title,
          startDate: start,
          venue,
          district,
        })
      ),
    ],
  };
}

export function parseBiletcimEventPage(
  html: string,
  pageUrl: string,
  capturedAt: string,
  crawlRunId?: string
): RawSpiderEvent | { skip: string } {
  const events = extractSchemaEvents(html);
  if (events.length === 0) {
    return { skip: "missing-jsonld-event" };
  }
  return mapSchemaEventToRaw(events[0], pageUrl, capturedAt, crawlRunId);
}

function resolveMaxEvents(requested?: number): number {
  const fromEnv = Number(process.env.ORUMCEK_CRAWL_MAX_EVENTS);
  const fallback = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_EVENTS;
  const raw = requested ?? fallback;
  return Math.min(Math.max(Math.floor(raw), 1), DEFAULT_MAX_EVENTS);
}

export async function crawlKibrisBiletcim(options: SpiderCrawlOptions = {}): Promise<BiletcimParseResult> {
  const fetchPage: CrawlFetchFn = options.fetchPage ?? defaultCrawlFetch;
  const now = options.now ?? (() => new Date().toISOString());
  const maxEvents = resolveMaxEvents(options.maxEvents);
  const delayMs = options.delayMs ?? DEFAULT_DETAIL_DELAY_MS;
  const crawlRunId = options.crawlRunId;
  const capturedAt = now();
  const listingUrl = KIBRIS_BILETCIM_LISTING_URL;

  const listing = await fetchPage(listingUrl);
  const skipped: CrawlSkip[] = [];
  if (listing.status < 200 || listing.status >= 400) {
    return {
      events: [],
      skipped: [
        {
          url: listingUrl,
          reason: `listing-http-${listing.status || "network"}`,
        },
      ],
      pageFetches: 1,
      listingUrl,
    };
  }

  const urls = extractBiletcimEventUrls(listing.body).slice(0, maxEvents);
  if (urls.length === 0) {
    skipped.push({ url: listingUrl, reason: "no-event-urls" });
    return { events: [], skipped, pageFetches: 1, listingUrl };
  }

  const events: RawSpiderEvent[] = [];
  for (let index = 0; index < urls.length; index += 1) {
    if (index > 0) {
      await delay(delayMs);
    }
    const url = urls[index];
    const page = await fetchPage(url);
    if (page.status < 200 || page.status >= 400) {
      skipped.push({ url, reason: `detail-http-${page.status || "network"}` });
      continue;
    }
    const parsed = parseBiletcimEventPage(page.body, url, capturedAt, crawlRunId);
    if ("skip" in parsed) {
      skipped.push({ url, reason: parsed.skip });
      continue;
    }
    events.push(parsed);
  }

  return { events, skipped, pageFetches: 1 + urls.length, listingUrl };
}
