import { createIntakeFingerprint } from "@/lib/admin/intake/fingerprint";
import { createManualNoteEvidence } from "@/lib/admin/intake/evidence";
import { normalizeEventTitle } from "@/lib/admin/intake/normalize";
import type { AdminIntakeRepository } from "@/lib/admin/repositories/admin-intake-repository";
import type { CreateIntakeInput, DiscoveredEventIntake, ManualIntakeFormData } from "@/types/admin/intake";
import type { ImageCandidate } from "@/types/admin/image-candidate";

function buildOfficialPosterCandidate(
  intakeId: string,
  url: string,
  districtId: string
): ImageCandidate {
  return {
    id: `img-official-${intakeId}`,
    eventIntakeId: intakeId,
    source: "OFFICIAL",
    url: url.trim(),
    districtId,
    status: "PENDING",
    generatedByAi: false,
  };
}

export function buildManualIntakeInput(data: ManualIntakeFormData): CreateIntakeInput {
  const capturedAt = new Date().toISOString();
  const evidence = [];

  if (data.manualNote?.trim()) {
    evidence.push(createManualNoteEvidence(data.manualNote.trim(), capturedAt));
  }

  const normalizedTitle = normalizeEventTitle(data.rawTitle);
  const fingerprint = createIntakeFingerprint({
    title: normalizedTitle,
    district: data.suggestedDistrictId,
    venue: data.suggestedVenueId,
    startsAt: data.suggestedStartsAt,
  });

  return {
    status: "DISCOVERED",
    source: "MANUAL",
    sourceUrl: data.sourceUrl?.trim() || undefined,
    rawTitle: data.rawTitle.trim(),
    rawDescription: data.rawDescription?.trim(),
    suggestedCategory: data.suggestedCategory,
    suggestedDistrictId: data.suggestedDistrictId,
    suggestedVenueId: data.suggestedVenueId?.trim() || undefined,
    suggestedStartsAt: data.suggestedStartsAt,
    artist: data.artist?.trim() || undefined,
    fingerprint,
    evidence,
    imageCandidates: [],
  };
}

export function createManualIntake(
  repository: AdminIntakeRepository,
  data: ManualIntakeFormData
): DiscoveredEventIntake {
  const input = buildManualIntakeInput(data);
  const intake = repository.create(input);

  if (data.officialPosterUrl?.trim()) {
    const candidate = buildOfficialPosterCandidate(
      intake.id,
      data.officialPosterUrl,
      intake.suggestedDistrictId
    );
    return repository.update({
      ...intake,
      imageCandidates: [candidate],
    });
  }

  return intake;
}
