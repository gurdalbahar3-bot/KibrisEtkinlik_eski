import { describe, expect, it } from "vitest";
import {
  buildIdentityKey,
  createEventIdentity,
  findMatchingIdentity,
  identityKeyFromObservation,
  normalizeIdentityTitle,
} from "@/lib/orumcek/identity";
import { observation } from "@/lib/orumcek/test-helpers";

describe("event identity / dedup", () => {
  it("collapses ticket listings onto the same real event", () => {
    const venuePost = observation({
      publisherId: "venue-lefke",
      channelKind: "WEBSITE",
      sourceUrl: "https://venue-lefke.example/akustik",
      title: "Lefke Akustik Gece",
    });
    const ticketListing = observation({
      publisherId: "biletix",
      channelKind: "TICKET",
      sourceUrl: "https://biletix.com/lefke-akustik-gece-biletler",
      title: "Lefke Akustik Gece - Biletler",
    });

    expect(normalizeIdentityTitle(ticketListing.raw.rawTitle)).toBe(
      normalizeIdentityTitle(venuePost.raw.rawTitle)
    );
    expect(identityKeyFromObservation(ticketListing)).toBe(identityKeyFromObservation(venuePost));

    const identity = createEventIdentity("identity-1", venuePost);
    expect(findMatchingIdentity([identity], ticketListing)?.id).toBe("identity-1");
  });

  it("does not treat ticket site URLs as a separate event identity", () => {
    const keyA = buildIdentityKey("Lefke Akustik Gece", "Lefke");
    const keyB = buildIdentityKey("Lefke Akustik Gece | Biletix", "lefke");
    expect(keyA).toBe(keyB);
  });

  it("keeps different districts as different events", () => {
    const lefke = observation({ publisherId: "a", district: "Lefke", title: "Yaz Konseri" });
    const girne = observation({ publisherId: "b", district: "Girne", title: "Yaz Konseri" });
    expect(identityKeyFromObservation(lefke)).not.toBe(identityKeyFromObservation(girne));
  });
});
