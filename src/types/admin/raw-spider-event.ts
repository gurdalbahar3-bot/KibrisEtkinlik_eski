import type { IntakeEvidence } from "@/types/admin/intake-evidence";

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
}

export interface RawSpiderIngestInput {
  raw: RawSpiderEvent;
}
