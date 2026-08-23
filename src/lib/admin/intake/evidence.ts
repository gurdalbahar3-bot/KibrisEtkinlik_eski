import type { EvidenceType, IntakeEvidence } from "@/types/admin/intake-evidence";

/** Simple deterministic hash for evidence records — no crypto dependency. */
export function createEvidenceHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function createEvidence(
  type: EvidenceType,
  sourceUrl: string,
  capturedAt: string,
  hashContent: string,
  id?: string
): IntakeEvidence {
  return {
    id: id ?? `ev-${createEvidenceHash(`${type}:${sourceUrl}:${capturedAt}`)}`,
    type,
    sourceUrl,
    capturedAt,
    hash: createEvidenceHash(hashContent),
  };
}

export function createManualNoteEvidence(note: string, capturedAt: string): IntakeEvidence {
  return createEvidence("MANUAL_NOTE", `manual://note/${createEvidenceHash(note)}`, capturedAt, note);
}
