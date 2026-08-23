import { countIndependentPublishers, uniquePublisherIds } from "@/lib/orumcek/publisher";
import {
  INDEPENDENT_PUBLISHER_THRESHOLD,
  type CorroborationDecision,
  type RawObservation,
} from "@/lib/orumcek/types";

export { INDEPENDENT_PUBLISHER_THRESHOLD };

export function evaluateCorroboration(input: {
  publisherIds: Iterable<string>;
  hasContradiction: boolean;
  unsure: boolean;
}): CorroborationDecision {
  const publisherIds = uniquePublisherIds(input.publisherIds);
  const independentPublisherCount = publisherIds.length;
  const met = independentPublisherCount >= INDEPENDENT_PUBLISHER_THRESHOLD;

  return {
    independentPublisherCount,
    threshold: INDEPENDENT_PUBLISHER_THRESHOLD,
    met,
    publisherIds,
    autoEligible: met && !input.hasContradiction && !input.unsure,
  };
}

export function evaluateCorroborationFromObservations(
  observations: RawObservation[],
  flags: { hasContradiction: boolean; unsure: boolean }
): CorroborationDecision {
  return evaluateCorroboration({
    publisherIds: observations.map((item) => item.publisherId),
    hasContradiction: flags.hasContradiction,
    unsure: flags.unsure,
  });
}

export function independentPublisherCountFromObservations(
  observations: RawObservation[]
): number {
  return countIndependentPublishers(observations);
}
