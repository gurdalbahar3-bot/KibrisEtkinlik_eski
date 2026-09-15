import type { DistrictSlug, EventCategory } from "@/types/event";
import type { RawSpiderEvent, SpiderCaptureProvenance } from "@/types/admin/raw-spider-event";
import type { IntakeEvidence } from "@/types/admin/intake-evidence";

export type { SpiderCaptureProvenance };

/**
 * Örümcek motor statuses. PUBLISHED is intentionally absent —
 * Super Admin remains the only public catalog publish gate.
 */
export const ORUMCEK_STATUSES = [
  "DISCOVERED",
  "AI_DRAFT",
  "REVIEW",
  "PENDING_APPROVAL",
  "APPROVED_READY",
  "REJECTED",
] as const;

export type OrumcekStatus = (typeof ORUMCEK_STATUSES)[number];

export const ORUMCEK_QUEUE_STATUSES = ["PENDING_APPROVAL", "REVIEW"] as const;
export type OrumcekQueueStatus = (typeof ORUMCEK_QUEUE_STATUSES)[number];

export const ORUMCEK_TERMINAL_STATUSES = ["APPROVED_READY", "REJECTED"] as const;
export type OrumcekTerminalStatus = (typeof ORUMCEK_TERMINAL_STATUSES)[number];

export type SourceKind = "TICKETING" | "MUNICIPALITY" | "UNIVERSITY";
export type SourceChannelKind = "WEBSITE" | "INSTAGRAM" | "FACEBOOK";

export interface SourceChannel {
  kind: SourceChannelKind;
  url: string;
  label?: string;
}

/**
 * First-wave KKTC source seed. `liveCrawl` stays false on every seed:
 * adapters never auto-enable. Runtime live crawl requires ORUMCEK_LIVE_CRAWL=1
 * plus an allowlisted source id.
 */
export interface SourceSeed {
  id: string;
  name: string;
  kind: SourceKind;
  websiteUrl: string;
  districtHint?: DistrictSlug;
  channels: SourceChannel[];
  enabled: boolean;
  /** Catalog default. Never treat this as a runtime enablement flag. */
  liveCrawl: false;
  notes?: string;
}

export type AIDraftField =
  | "title"
  | "description"
  | "category"
  | "districtId"
  | "venueName"
  | "venueId"
  | "startsAt"
  | "artist"
  | "officialTicketUrl";

/** Structured draft a later AI provider will fill. Stub adapter never calls an API. */
export interface AIDraft {
  title?: string;
  description?: string;
  category?: EventCategory;
  districtId?: DistrictSlug;
  venueName?: string;
  venueId?: string;
  startsAt?: string;
  artist?: string;
  officialTicketUrl?: string;
  unsureFields: AIDraftField[];
}

export type ContradictionField = "title" | "date" | "venue" | "district" | "category";

export interface FieldContradiction {
  field: ContradictionField;
  values: string[];
}

export interface ConfidenceReport {
  score: number;
  unsure: boolean;
  hasContradiction: boolean;
  contradictions: FieldContradiction[];
  reasons: string[];
}

export interface EventIdentity {
  id: string;
  identityKey: string;
  titleNormalized: string;
  district: string;
  dateKey: string;
  observationIds: string[];
}

export interface SpiderObservation {
  id: string;
  observationKey: string;
  sourceSeedId?: string;
  sourceUrl: string;
  raw: RawSpiderEvent;
  capturedAt: string;
  evidence: IntakeEvidence[];
  provenance: SpiderCaptureProvenance;
  crawlRunId?: string;
}

export interface IntakeDraft {
  id: string;
  status: OrumcekStatus;
  identity: EventIdentity;
  observationIds: string[];
  sourceSeedId?: string;
  sourceUrl: string;
  draft: AIDraft;
  confidence: ConfidenceReport;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  provenance: SpiderCaptureProvenance;
  crawlRunId?: string;
  /** Spider never writes `events`. Super Admin publish_event is the only public gate. */
  wrotePublicEvent: false;
  createdAt: string;
  updatedAt: string;
}

export type DuplicateReason = "observation" | "identity";

export interface SpiderIngestResult {
  draft: IntakeDraft;
  observation: SpiderObservation;
  duplicate: boolean;
  duplicateReason?: DuplicateReason;
  wrotePublicEvent: false;
}

export type OrumcekActorType = "SYSTEM" | "SUPER_ADMIN";

export interface OrumcekTransitionContext {
  actor: OrumcekActorType;
  actorId?: string;
  reason?: string;
}

export type OrumcekTransitionErrorCode =
  | "INVALID_TRANSITION"
  | "ACTOR_NOT_ALLOWED"
  | "REASON_REQUIRED"
  | "PUBLISH_FORBIDDEN";

export interface OrumcekTransitionSuccess {
  ok: true;
  from: OrumcekStatus;
  to: OrumcekStatus;
}

export interface OrumcekTransitionFailure {
  ok: false;
  code: OrumcekTransitionErrorCode;
  message: string;
}

export type OrumcekTransitionResult = OrumcekTransitionSuccess | OrumcekTransitionFailure;

export interface AIDraftPort {
  draft(observations: SpiderObservation[]): Promise<AIDraft>;
}

/** Port: identity/dedup + confidence stub + draft DTO. Never writes public events. */
export interface SpiderIntakePort {
  ingest(raw: RawSpiderEvent): Promise<SpiderIngestResult>;
}

export interface SpiderCrawlPort {
  sourceId: string;
  crawl(options?: SpiderCrawlOptions): Promise<RawSpiderEvent[]>;
}

export interface SpiderCrawlOptions {
  fetchPage?: CrawlFetchFn;
  now?: () => string;
  maxEvents?: number;
  delayMs?: number;
  crawlRunId?: string;
}

export interface CrawlFetchFn {
  (url: string): Promise<CrawlFetchResult>;
}

export interface CrawlFetchResult {
  url: string;
  status: number;
  body: string;
}

export type LiveCrawlGateCode =
  | "LIVE_CRAWL_DISABLED"
  | "SOURCE_NOT_ALLOWLISTED"
  | "SOURCE_UNKNOWN"
  | "SOURCE_DISABLED"
  | "ADAPTER_MISSING";

export interface LiveCrawlGateSuccess {
  ok: true;
  sourceId: string;
  flagOn: true;
}

export interface LiveCrawlGateFailure {
  ok: false;
  code: LiveCrawlGateCode;
  message: string;
  sourceId: string;
}

export type LiveCrawlGateResult = LiveCrawlGateSuccess | LiveCrawlGateFailure;

export interface CrawlSkip {
  url: string;
  reason: string;
}

export interface OrumcekCrawlRunSummary {
  sourceId: string;
  sourceName: string;
  listingUrl: string;
  startedAt: string;
  finishedAt: string;
  pageFetches: number;
  observationCount: number;
  ingested: number;
  duplicates: number;
  skipped: number;
  skipReasons: string[];
  wrotePublicEvent: false;
  publishCalled: false;
}

export interface LiveCrawlIngestSuccess {
  ok: true;
  sourceId: string;
  listingUrl: string;
  results: SpiderIngestResult[];
  skipped: CrawlSkip[];
  pageFetches: number;
  ingested: number;
  duplicates: number;
  wrotePublicEvent: false;
  publishCalled: false;
}

export type LiveCrawlIngestResult = LiveCrawlIngestSuccess | (LiveCrawlGateFailure & {
  wrotePublicEvent: false;
  publishCalled: false;
});
