import { describe, expect, it } from "vitest";
import { createIntakeFingerprint } from "@/lib/admin/intake/fingerprint";
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

  it("canonicalizes EN/TR district names onto the same identity", () => {
    expect(buildIdentityKey("Jazz Night", "Nicosia")).toBe(buildIdentityKey("Jazz Night", "lefkosa"));
    expect(buildIdentityKey("Jazz Night", "Lefkoşa")).toBe(buildIdentityKey("Jazz Night", "lefkosa"));
    expect(buildIdentityKey("Jazz Night", "kyrenia")).toBe(buildIdentityKey("Jazz Night", "Girne"));
  });

  it("keeps the same title+district identity when the date differs", () => {
    const friday = observation({
      publisherId: "venue-lefke",
      title: "Yaz Konseri",
      district: "Lefke",
      date: "2026-08-20",
    });
    const saturday = observation({
      publisherId: "gazete-kibris",
      title: "Yaz Konseri",
      district: "Lefke",
      date: "2026-08-21",
    });

    expect(identityKeyFromObservation(friday)).toBe(identityKeyFromObservation(saturday));
    const identity = createEventIdentity("identity-date", friday);
    expect(findMatchingIdentity([identity], saturday)?.id).toBe("identity-date");
  });

  it("keeps the same title+district identity when the venue differs", () => {
    const sahil = observation({
      publisherId: "venue-lefke",
      title: "Yaz Konseri",
      district: "Lefke",
      venue: "Gemikonagi Sahil",
    });
    const kultur = observation({
      publisherId: "gazete-kibris",
      title: "Yaz Konseri",
      district: "Lefke",
      venue: "Lefke Kultur Merkezi",
    });

    expect(identityKeyFromObservation(sahil)).toBe(identityKeyFromObservation(kultur));
    const identity = createEventIdentity("identity-venue", sahil);
    expect(findMatchingIdentity([identity], kultur)?.id).toBe("identity-venue");
  });

  it("uses the same canonical fingerprint as admin spider ingest", () => {
    const key = buildIdentityKey("Lefke Akustik Gece - Biletler", "Nicosia");
    const fingerprint = createIntakeFingerprint({
      title: "Lefke Akustik Gece - Biletler",
      district: "nicosia",
      venue: "some-other-hall",
      startsAt: "2026-09-01T21:00:00.000Z",
    });
    expect(fingerprint).toBe(key);
    expect(fingerprint).toBe("lefke akustik gece|lefkosa");
  });
});
