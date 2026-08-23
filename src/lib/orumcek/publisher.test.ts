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
});
