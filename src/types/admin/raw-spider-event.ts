import type { IntakeEvidence } from "@/types/admin/intake-evidence";

export type SpiderChannelKind =
  | "WEBSITE"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "TICKET"
  | "OTHER";

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
  /** Publisher identity for independence counting. Same org's web+IG share this id. */
  publisherId?: string;
  channelKind?: SpiderChannelKind;
}

export interface RawSpiderIngestInput {
  raw: RawSpiderEvent;
}
