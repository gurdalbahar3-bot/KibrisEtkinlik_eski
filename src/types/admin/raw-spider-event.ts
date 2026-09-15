import type { IntakeEvidence } from "@/types/admin/intake-evidence";

export type SpiderCaptureProvenance = "FIXTURE" | "LIVE_CRAWL";

/** Raw spider capture — never a cleaned public Event. */
export interface RawSpiderEvent {
  sourceUrl: string;
  rawTitle: string;
  rawDescription?: string;
  rawDate?: string;
  rawTime?: string;
  rawVenue?: string;
  rawDistrict?: string;
  rawCategory?: string;
  rawArtist?: string;
  capturedAt: string;
  evidence: IntakeEvidence[];
  /** Fixture seed vs gated live crawl. Defaults to FIXTURE when omitted. */
  provenance?: SpiderCaptureProvenance;
  crawlRunId?: string;
}

export interface RawSpiderIngestInput {
  raw: RawSpiderEvent;
}

export interface RawSpiderIngestInput {
  raw: RawSpiderEvent;
}
