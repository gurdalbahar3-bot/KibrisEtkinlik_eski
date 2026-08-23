export type EvidenceType = "HTML" | "JSON" | "SCREENSHOT" | "MANUAL_NOTE";

export interface IntakeEvidence {
  id: string;
  type: EvidenceType;
  sourceUrl: string;
  capturedAt: string;
  hash: string;
}
