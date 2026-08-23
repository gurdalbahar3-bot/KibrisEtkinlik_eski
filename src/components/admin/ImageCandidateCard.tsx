import Image from "next/image";
import { evaluateImageCandidate } from "@/types/admin/image-policy";
import type { ImageCandidate } from "@/types/admin/image-candidate";
import { formatDistrictLabel } from "@/lib/admin/format";
import type { AdminMessages } from "@/lib/admin/i18n";

const REJECT_REASONS = [
  "DISTRICT_MISMATCH",
  "VENUE_MISMATCH",
  "IRRELEVANT",
  "LOW_QUALITY",
  "WRONG_IMAGE",
  "AI_NOT_SUITABLE",
] as const;

interface ImageCandidateCardProps {
  candidate: ImageCandidate;
  eventTitle: string;
  eventDistrictId: string;
  eventVenueId?: string;
  locale: "tr" | "en";
  t: (key: keyof AdminMessages) => string;
  showActions?: boolean;
  approveAction?: (formData: FormData) => Promise<void>;
  rejectAction?: (formData: FormData) => Promise<void>;
}

export function ImageCandidateCard({
  candidate,
  eventTitle,
  eventDistrictId,
  eventVenueId,
  locale,
  t,
  showActions = false,
  approveAction,
  rejectAction,
}: ImageCandidateCardProps) {
  const policy = evaluateImageCandidate(candidate, {
    eventDistrictId,
    eventVenueId,
  });

  const isBlocked = policy.verdict === "BLOCKED";
  const isAi = candidate.source === "AI" || candidate.generatedByAi;

  return (
    <article
      className={`rounded-xl border p-4 ${
        isBlocked ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100">
        <Image
          src={candidate.url}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 320px"
        />
      </div>

      <div className="mt-3">
        <p className="text-sm font-semibold text-slate-900">{eventTitle}</p>
        <p className="text-xs text-slate-500">
          {formatDistrictLabel(eventDistrictId, locale)}
          {eventVenueId ? ` · ${eventVenueId}` : ""}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {candidate.source}
        </span>
        {isAi ? (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
            {t("aiGeneratedBadge")}
          </span>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            policy.verdict === "VALID"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {t("policyLabel")}: {policy.verdict}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            candidate.status === "APPROVED"
              ? "bg-emerald-100 text-emerald-800"
              : candidate.status === "REJECTED"
                ? "bg-red-100 text-red-800"
                : "bg-amber-100 text-amber-900"
          }`}
        >
          {candidate.status}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">{t("eventDistrict")}</dt>
          <dd className="font-medium text-slate-900">
            {formatDistrictLabel(eventDistrictId, locale)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">{t("imageDistrict")}</dt>
          <dd className="font-medium text-slate-900">
            {formatDistrictLabel(candidate.districtId, locale)}
          </dd>
        </div>
        {candidate.relevanceScore !== undefined ? (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{t("relevanceScore")}</dt>
            <dd className="font-medium text-slate-900">
              {Math.round(candidate.relevanceScore * 100)}%
            </dd>
          </div>
        ) : null}
        {candidate.reviewedBy ? (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{t("reviewedBy")}</dt>
            <dd className="font-medium text-slate-900">{candidate.reviewedBy}</dd>
          </div>
        ) : null}
        {candidate.rejectionReason ? (
          <div>
            <dt className="text-slate-500">{t("historyReason")}</dt>
            <dd className="font-medium text-slate-900">{candidate.rejectionReason}</dd>
          </div>
        ) : null}
      </dl>

      {isBlocked ? (
        <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
          {t("imageDistrictMismatch")}
          {policy.blockReason ? (
            <span className="mt-1 block text-xs opacity-80">{policy.blockReason}</span>
          ) : null}
        </p>
      ) : null}

      {isAi && !isBlocked ? (
        <div className="mt-2 space-y-1">
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">
            {t("aiGeneratedBadge")}
          </p>
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">
            {t("imageAiHumanRequired")}
          </p>
        </div>
      ) : null}

      {showActions && approveAction && rejectAction && candidate.status === "PENDING" ? (
        <div className="mt-4 space-y-3">
          <form action={approveAction}>
            <input type="hidden" name="intakeId" value={candidate.eventIntakeId} />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <button
              type="submit"
              disabled={isBlocked}
              title={isBlocked ? policy.reason : undefined}
              className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("approveImage")}
            </button>
          </form>
          <form action={rejectAction} className="space-y-2">
            <input type="hidden" name="intakeId" value={candidate.eventIntakeId} />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <select
              name="reason"
              required
              defaultValue=""
              className="min-h-9 w-full rounded-lg border border-slate-300 px-2 text-xs"
            >
              <option value="" disabled>
                {t("selectRejectReason")}
              </option>
              {REJECT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`rejectReason_${reason}` as keyof AdminMessages)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800"
            >
              {t("rejectImage")}
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
