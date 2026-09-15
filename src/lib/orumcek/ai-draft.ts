import {
  combineDateTime,
  resolveCategory,
  slugifyVenue,
  tryResolveDistrict,
} from "@/lib/orumcek/identity";
import type { AIDraft, AIDraftField, AIDraftPort, SpiderObservation } from "@/lib/orumcek/types";
import type { DistrictSlug, EventCategory } from "@/types/event";

function majority<T extends string>(values: T[]): { value?: T; tied: boolean } {
  if (values.length === 0) {
    return { tied: false };
  }
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | undefined;
  let bestCount = 0;
  let tied = false;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  if (tied) {
    return { value: values[0], tied: true };
  }
  return { value: best, tied: false };
}

/** Deterministic stub — no live AI provider call. */
export class StubAIDraftAdapter implements AIDraftPort {
  async draft(observations: SpiderObservation[]): Promise<AIDraft> {
    return buildStubDraft(observations);
  }
}

export const stubAIDraftAdapter = new StubAIDraftAdapter();

export function buildStubDraft(observations: SpiderObservation[]): AIDraft {
  const unsureFields: AIDraftField[] = [];

  const titles = observations.map((item) => item.raw.rawTitle.trim()).filter(Boolean);
  const titleVote = majority(titles);
  if (titleVote.tied) unsureFields.push("title");

  const descriptions = observations
    .map((item) => item.raw.rawDescription?.trim())
    .filter((item): item is string => Boolean(item));
  const descriptionVote = majority(descriptions);
  if (descriptions.length > 1 && descriptionVote.tied) unsureFields.push("description");

  const categories = observations
    .map((item) => resolveCategory(item.raw.rawCategory))
    .filter((item): item is EventCategory => Boolean(item));
  const categoryVote = majority(categories);
  if (categories.length > 1 && categoryVote.tied) unsureFields.push("category");

  const districts = observations
    .map((item) => tryResolveDistrict(item.raw.rawDistrict))
    .filter((item): item is DistrictSlug => Boolean(item));
  const districtVote = majority(districts);
  if (districts.length > 1 && districtVote.tied) unsureFields.push("districtId");

  const venues = observations
    .map((item) => item.raw.rawVenue?.trim())
    .filter((item): item is string => Boolean(item));
  const venueVote = majority(venues);
  if (venues.length > 1 && venueVote.tied) {
    unsureFields.push("venueName");
    unsureFields.push("venueId");
  }

  const startsAtValues = observations
    .map((item) => combineDateTime(item.raw.rawDate, item.raw.rawTime))
    .filter((item): item is string => Boolean(item));
  const startsAtVote = majority(startsAtValues);
  if (startsAtValues.length > 1 && startsAtVote.tied) unsureFields.push("startsAt");

  const artists = observations
    .map((item) => item.raw.rawArtist?.trim())
    .filter((item): item is string => Boolean(item));
  const artistVote = majority(artists);
  if (artists.length > 1 && artistVote.tied) unsureFields.push("artist");

  const ticketUrl = observations.find((item) => /ticket|bilet|gise/i.test(item.sourceUrl))?.sourceUrl;

  return {
    title: titleVote.value,
    description: descriptionVote.value,
    category: categoryVote.value,
    districtId: districtVote.value,
    venueName: venueVote.value,
    venueId: slugifyVenue(venueVote.value),
    startsAt: startsAtVote.value,
    artist: artistVote.value,
    officialTicketUrl: ticketUrl,
    unsureFields,
  };
}
