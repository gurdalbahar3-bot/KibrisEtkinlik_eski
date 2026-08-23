import { describe, expect, it } from "vitest";
import { countIndependentPublishers, uniquePublisherIds } from "@/lib/orumcek/publisher";
import { observation } from "@/lib/orumcek/test-helpers";

describe("publisher independence", () => {
  it("counts unique publisher identities, not URLs", () => {
    const observations = [
      observation({
        publisherId: "venue-lefke",
        channelKind: "WEBSITE",
        sourceUrl: "https://venue-lefke.example/akustik",
      }),
      observation({
        publisherId: "gazete-kibris",
        channelKind: "WEBSITE",
        sourceUrl: "https://gazete.example/akustik",
      }),
      observation({
        publisherId: "gazete-kibris",
        channelKind: "FACEBOOK",
        sourceUrl: "https://facebook.com/gazete/posts/1",
      }),
    ];

    expect(countIndependentPublishers(observations)).toBe(2);
    expect(uniquePublisherIds(observations.map((item) => item.publisherId))).toEqual([
      "venue-lefke",
      "gazete-kibris",
    ]);
  });

  it("treats the same publisher website + Instagram as one source", () => {
    const observations = [
      observation({
        publisherId: "venue-lefke",
        channelKind: "WEBSITE",
        sourceUrl: "https://venue-lefke.example/akustik",
      }),
      observation({
        publisherId: "venue-lefke",
        channelKind: "INSTAGRAM",
        sourceUrl: "https://instagram.com/venuelefke/p/abc",
      }),
    ];

    expect(countIndependentPublishers(observations)).toBe(1);
  });

  it("treats website + Instagram + Facebook as one publisher", () => {
    const observations = [
      observation({ publisherId: "venue-lefke", channelKind: "WEBSITE" }),
      observation({ publisherId: "venue-lefke", channelKind: "INSTAGRAM" }),
      observation({ publisherId: "venue-lefke", channelKind: "FACEBOOK" }),
    ];

    expect(countIndependentPublishers(observations)).toBe(1);
  });

  it("does not let a ticket aggregator increment the independent count", () => {
    const observations = [
      observation({ publisherId: "venue-lefke", channelKind: "WEBSITE" }),
      observation({ publisherId: "gazete-kibris", channelKind: "WEBSITE" }),
      observation({ publisherId: "radyo-guzelyurt", channelKind: "WEBSITE" }),
      observation({
        publisherId: "biletix",
        channelKind: "TICKET",
        publisherRole: "TICKET_AGGREGATOR",
        sourceUrl: "https://biletix.com/lefke-akustik-biletler",
      }),
    ];

    expect(countIndependentPublishers(observations)).toBe(3);
  });
});
