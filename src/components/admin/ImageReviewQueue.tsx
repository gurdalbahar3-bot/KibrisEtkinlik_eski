"use client";

import { useState } from "react";
import { ImageCandidateCard } from "@/components/admin/ImageCandidateCard";
import { sortCandidatesByPriority } from "@/lib/admin/review/image-review-service";
import type { AdminMessages } from "@/lib/admin/i18n";
import type { DiscoveredEventIntake } from "@/types/admin/intake";

interface ImageReviewQueueProps {
  intakes: DiscoveredEventIntake[];
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  approveAction: (formData: FormData) => Promise<void>;
  rejectAction: (formData: FormData) => Promise<void>;
}

export function ImageReviewQueue({
  intakes,
  locale,
  t,
  approveAction,
  rejectAction,
}: ImageReviewQueueProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove(formData: FormData) {
    setMessage(null);
    setError(null);
    try {
      await approveAction(formData);
      setMessage(t("imageReviewSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("imageReviewError"));
    }
  }

  async function handleReject(formData: FormData) {
    setMessage(null);
    setError(null);
    try {
      await rejectAction(formData);
      setMessage(t("imageReviewSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("imageReviewError"));
    }
  }

  const pendingCandidates = intakes.flatMap((intake) =>
    sortCandidatesByPriority(intake.imageCandidates)
      .filter((candidate) => candidate.status === "PENDING")
      .map((candidate) => ({ intake, candidate }))
  );

  if (pendingCandidates.length === 0) {
    return <p className="text-sm text-slate-500">{t("noImageReviewQueue")}</p>;
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <p className="text-xs text-slate-500">{t("imageReviewNote")}</p>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {pendingCandidates.map(({ intake, candidate }) => (
          <ImageCandidateCard
            key={candidate.id}
            candidate={candidate}
            eventTitle={intake.rawTitle}
            eventDistrictId={intake.suggestedDistrictId}
            eventVenueId={intake.suggestedVenueId}
            locale={locale}
            t={t}
            showActions
            approveAction={handleApprove}
            rejectAction={handleReject}
          />
        ))}
      </div>
    </div>
  );
}
