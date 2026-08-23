import type { EventCategory, DistrictSlug } from "@/types/event";
import type { RawSpiderEvent, SpiderChannelKind } from "@/types/admin/raw-spider-event";
import type { IntakeCorroboration } from "@/types/admin/intake";
import type { IntakeStatus } from "@/types/admin/lifecycle";

/** Motor-only statuses. Never APPROVED or PUBLISHED. */
export const SPIDER_MOTOR_STATUSES = [
  "DISCOVERED",
  "AI_DRAFT",
  "REVIEW",
  "PENDING_APPROVAL",
] as const;

export type SpiderMotorStatus = (typeof SPIDER_MOTOR_STATUSES)[number];

export const INDEPENDENT_PUBLISHER_THRESHOLD = 4;

export type PublisherRole = "PUBLISHER" | "TICKET_AGGREGATOR";

export interface Publisher {
  id: string;
  name: string;
  role: PublisherRole;
}

export interface PublisherChannel {
  id: string;
  publisherId: string;
  kind: SpiderChannelKind;
  url: string;
  label?: string;
}

/** Seeded publisher identity: one publisher may own website + Instagram + Facebook. */
export interface SourceSeed {
  id: string;
  publisher: Publisher;
  channels: PublisherChannel[];
  enabled: boolean;
}

export type SpiderJobStatus = "queued" | "running" | "done" | "failed";

export interface SpiderJob {
  id: string;
  seedId: string;
  channelId: string;
  status: SpiderJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  observationIds: string[];
}

/**
 * One observation = one fetched-or-stubbed page/post from one URL
 * belonging to one publisher. Wraps existing RawSpiderEvent.
 */
export interface RawObservation {
  id: string;
  publisherId: string;
  channelId: string;
  channelKind: SpiderChannelKind;
  sourceUrl: string;
  raw: RawSpiderEvent;
  capturedAt: string;
  jobId?: string;
}

export interface EventIdentity {
  id: string;
  identityKey: string;
  titleNormalized: string;
  district: string;
  intakeId?: string;
  observationIds: string[];
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

/** Structured draft the later AI will fill. Stub adapter does not call an API. */
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

export interface AIDraftPort {
  draft(observations: RawObservation[]): Promise<AIDraft>;
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

export interface CorroborationDecision extends IntakeCorroboration {
  autoEligible: boolean;
}

export interface MotorRecord {
  id: string;
  status: SpiderMotorStatus;
  identity: EventIdentity;
  observations: RawObservation[];
  draft?: AIDraft;
  confidence?: ConfidenceReport;
  corroboration?: CorroborationDecision;
  autoEligible: boolean;
  intakeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MotorEvaluation {
  draft: AIDraft;
  confidence: ConfidenceReport;
  corroboration: CorroborationDecision;
  motorStatus: Extract<SpiderMotorStatus, "PENDING_APPROVAL" | "REVIEW">;
  adminStatus: Extract<IntakeStatus, "PENDING_APPROVAL" | "AI_REVIEW">;
  autoEligible: boolean;
}

/** Stub fetch only — implementations must not hit the live web. */
export interface SpiderFetchPort {
  fetchObservation(job: SpiderJob, channel: PublisherChannel): Promise<RawObservation>;
}
