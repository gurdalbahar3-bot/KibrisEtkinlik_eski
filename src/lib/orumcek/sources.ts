import type { SourceSeed } from "@/lib/orumcek/types";

/**
 * First-wave KKTC source seeds. URLs are catalog metadata only.
 * Sprint 1 never fetches these; liveCrawl is locked to false.
 */
export const SOURCE_SEEDS: readonly SourceSeed[] = [
  {
    id: "gise-kibris",
    name: "Gişe Kıbrıs",
    kind: "TICKETING",
    websiteUrl: "https://www.gisekibris.com",
    channels: [{ kind: "WEBSITE", url: "https://www.gisekibris.com" }],
    enabled: true,
    liveCrawl: false,
    notes: "Primary KKTC ticketing aggregator.",
  },
  {
    id: "kibris-biletcim",
    name: "Kıbrıs Biletcim",
    kind: "TICKETING",
    websiteUrl: "https://www.kibrisbiletcim.com",
    channels: [{ kind: "WEBSITE", url: "https://www.kibrisbiletcim.com" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "ada-tickets",
    name: "Ada Tickets",
    kind: "TICKETING",
    websiteUrl: "https://www.adatickets.com",
    channels: [{ kind: "WEBSITE", url: "https://www.adatickets.com" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "lefkosa-belediye",
    name: "Lefkoşa Belediyesi",
    kind: "MUNICIPALITY",
    websiteUrl: "https://www.lefkosabelediyesi.org",
    districtHint: "lefkosa",
    channels: [{ kind: "WEBSITE", url: "https://www.lefkosabelediyesi.org" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "girne-belediye",
    name: "Girne Belediyesi",
    kind: "MUNICIPALITY",
    websiteUrl: "https://www.girnebelediyesi.com",
    districtHint: "girne",
    channels: [{ kind: "WEBSITE", url: "https://www.girnebelediyesi.com" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "gazimagusa-belediye",
    name: "Gazimağusa Belediyesi",
    kind: "MUNICIPALITY",
    websiteUrl: "https://www.magusa.org",
    districtHint: "gazimagusa",
    channels: [{ kind: "WEBSITE", url: "https://www.magusa.org" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "guzelyurt-belediye",
    name: "Güzelyurt Belediyesi",
    kind: "MUNICIPALITY",
    websiteUrl: "https://www.guzelyurtbelediyesi.com",
    districtHint: "guzelyurt",
    channels: [{ kind: "WEBSITE", url: "https://www.guzelyurtbelediyesi.com" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "lefke-belediye",
    name: "Lefke Belediyesi",
    kind: "MUNICIPALITY",
    websiteUrl: "https://www.lefkebelediyesi.com",
    districtHint: "lefke",
    channels: [{ kind: "WEBSITE", url: "https://www.lefkebelediyesi.com" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "iskele-belediye",
    name: "İskele Belediyesi",
    kind: "MUNICIPALITY",
    websiteUrl: "https://www.iskelebelediyesi.com",
    districtHint: "iskele",
    channels: [{ kind: "WEBSITE", url: "https://www.iskelebelediyesi.com" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "emu-dau",
    name: "Doğu Akdeniz Üniversitesi (DAÜ)",
    kind: "UNIVERSITY",
    websiteUrl: "https://www.emu.edu.tr",
    districtHint: "gazimagusa",
    channels: [{ kind: "WEBSITE", url: "https://www.emu.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "neu-ydu",
    name: "Yakın Doğu Üniversitesi (YDÜ)",
    kind: "UNIVERSITY",
    websiteUrl: "https://neu.edu.tr",
    districtHint: "lefkosa",
    channels: [{ kind: "WEBSITE", url: "https://neu.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "ciu-uku",
    name: "Uluslararası Kıbrıs Üniversitesi (UKÜ)",
    kind: "UNIVERSITY",
    websiteUrl: "https://www.ciu.edu.tr",
    districtHint: "lefkosa",
    channels: [{ kind: "WEBSITE", url: "https://www.ciu.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "eul-lau",
    name: "Lefke Avrupa Üniversitesi (LAÜ)",
    kind: "UNIVERSITY",
    websiteUrl: "https://www.eul.edu.tr",
    districtHint: "lefke",
    channels: [{ kind: "WEBSITE", url: "https://www.eul.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "gau",
    name: "Girne Amerikan Üniversitesi (GAÜ)",
    kind: "UNIVERSITY",
    websiteUrl: "https://www.gau.edu.tr",
    districtHint: "girne",
    channels: [{ kind: "WEBSITE", url: "https://www.gau.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "metu-ncc",
    name: "ODTÜ Kuzey Kıbrıs Kampusu",
    kind: "UNIVERSITY",
    websiteUrl: "https://ncc.metu.edu.tr",
    districtHint: "guzelyurt",
    channels: [{ kind: "WEBSITE", url: "https://ncc.metu.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
  {
    id: "university-of-kyrenia",
    name: "Girne Üniversitesi",
    kind: "UNIVERSITY",
    websiteUrl: "https://www.kyrenia.edu.tr",
    districtHint: "girne",
    channels: [{ kind: "WEBSITE", url: "https://www.kyrenia.edu.tr" }],
    enabled: true,
    liveCrawl: false,
  },
] as const;

export function listEnabledSourceSeeds(): SourceSeed[] {
  return SOURCE_SEEDS.filter((seed) => seed.enabled).map((seed) => ({
    ...seed,
    channels: seed.channels.map((channel) => ({ ...channel })),
  }));
}

export function getSourceSeedById(id: string): SourceSeed | undefined {
  const seed = SOURCE_SEEDS.find((item) => item.id === id);
  return seed
    ? { ...seed, channels: seed.channels.map((channel) => ({ ...channel })) }
    : undefined;
}

export function matchSourceSeed(sourceUrl: string): SourceSeed | undefined {
  const url = sourceUrl.trim().toLowerCase();
  if (!url) {
    return undefined;
  }

  return SOURCE_SEEDS.find((seed) => {
    const candidates = [seed.websiteUrl, ...seed.channels.map((channel) => channel.url)];
    return candidates.some((candidate) => url.startsWith(candidate.toLowerCase()));
  });
}

export function assertFixturesOnlyMode(): void {
  if (process.env.ORUMCEK_LIVE_CRAWL === "1") {
    throw new Error("Örümcek Sprint 1 refuses live crawl. Fixtures/tests only.");
  }
}
