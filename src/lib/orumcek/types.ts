import type { DistrictSlug, EventCategory } from "@/types/event";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";
import type { IntakeEvidence } from "@/types/admin/intake-evidence";

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

/** First-wave KKTC source seed — metadata only, never fetched in Sprint 1. */
export interface SourceSeed {
  id: string;
  name: string;
  kind: SourceKind;
  websiteUrl: string;
  districtHint?: DistrictSlug;
  channels: SourceChannel[];
  enabled: boolean;
  /** Sprint 1 hard lock: live crawl is never enabled. */
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
  /** Always false in Sprint 1 — spider never writes `events`. */
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
