import { intakeToSlug } from "@/lib/admin/publishing/publish-checklist";
import { getApprovedImageCandidate } from "@/lib/admin/publishing/publish-checklist";
import { formatDistrictLabel } from "@/lib/admin/format";
import { buildEventDetailMetadata, eventDetailPaths } from "@/lib/seo/event-metadata";
import { eventToJsonLd } from "@/lib/seo/jsonld";
import type { Locale } from "@/lib/i18n/routing";
import type { DiscoveredEventIntake } from "@/types/admin/intake";
import type { DiscoveryEvent } from "@/types/event";

const SITE_URL = "https://globaleventdiscovery.example";

export interface AdminPublishPreview {
  discoveryEvent: DiscoveryEvent;
  seoTitle: string;
  seoDescription: string;
  canonicalTr: string;
  canonicalEn: string;
  publicUrlTr: string;
  publicUrlEn: string;
  jsonLd: Record<string, unknown>;
  districtLabel: string;
  posterUrl?: string;
  imageSource?: string;
  isAiImage: boolean;
}

export function intakeToDiscoveryEvent(intake: DiscoveredEventIntake): DiscoveryEvent {
  const approvedImage = getApprovedImageCandidate(intake);
  const startsAt = intake.suggestedStartsAt ? new Date(intake.suggestedStartsAt) : null;
  const date = startsAt ? startsAt.toISOString().slice(0, 10) : "";
  const startTime = startsAt ? startsAt.toISOString().slice(11, 16) : "00:00";

  return {
    id: intake.id,
    title: intake.rawTitle,
    slug: intakeToSlug(intake.rawTitle),
    poster: approvedImage?.url ?? "",
    date,
    startTime,
    venue: intake.suggestedVenueId ?? "",
    venueSlug: intake.suggestedVenueId ?? "",
    district: intake.suggestedDistrictId,
    category: intake.suggestedCategory ?? "other",
    description: intake.rawDescription ?? "",
    isFree: !intake.officialTicketUrl,
    artist: intake.artist,
    officialTicketUrl: intake.officialTicketUrl,
  };
}

export function buildAdminPublishPreview(
  intake: DiscoveredEventIntake,
  locale: Locale
): AdminPublishPreview {
  const discoveryEvent = intakeToDiscoveryEvent(intake);
  const approvedImage = getApprovedImageCandidate(intake);
  const districtLabel = formatDistrictLabel(intake.suggestedDistrictId, locale);

  const seoTitle =
    locale === "tr"
      ? `${discoveryEvent.title} | ${districtLabel}`
      : `${discoveryEvent.title} | ${districtLabel}`;

  const seoDescription =
    discoveryEvent.description ||
    (locale === "tr"
      ? `${discoveryEvent.title} etkinlik detaylarÄ±.`
      : `Event details for ${discoveryEvent.title}.`);

  const metadata = buildEventDetailMetadata(discoveryEvent, locale, {
    title: seoTitle,
    description: seoDescription,
    siteName: "Global Event Discovery",
  });

  const paths = eventDetailPaths(discoveryEvent.slug);
  const jsonLd = eventToJsonLd(discoveryEvent, locale, SITE_URL);

  return {
    discoveryEvent,
    seoTitle: typeof metadata.title === "string" ? metadata.title : seoTitle,
    seoDescription,
    canonicalTr: `${SITE_URL}${paths.tr}`,
    canonicalEn: `${SITE_URL}${paths.en}`,
    publicUrlTr: `${SITE_URL}${paths.tr}`,
    publicUrlEn: `${SITE_URL}${paths.en}`,
    jsonLd,
    districtLabel,
    posterUrl: approvedImage?.url,
    imageSource: approvedImage?.source,
    isAiImage: Boolean(approvedImage?.generatedByAi || approvedImage?.source === "AI"),
  };
}

