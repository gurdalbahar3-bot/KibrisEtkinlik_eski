import { createEvidence } from "@/lib/admin/intake/evidence";
import { ingestRawSpiderEvent } from "@/lib/orumcek/ingest";
import {
  isOrumcekFixtureSeeded,
  markOrumcekFixturesSeeded,
  resetOrumcekStore,
} from "@/lib/orumcek/store";
import type { SpiderIngestResult } from "@/lib/orumcek/types";
import type { RawSpiderEvent } from "@/types/admin/raw-spider-event";

function fixtureEvidence(url: string, capturedAt: string, payload: string) {
  return [createEvidence("JSON", url, capturedAt, payload)];
}

/**
 * Fixture captures shaped like first-wave KKTC sources.
 * Never fetched from the live web — dry-run / tests / admin seed only.
 */
export const FIXTURE_RAW_EVENTS: RawSpiderEvent[] = [
  {
    sourceUrl: "https://www.gisekibris.com/events/lefke-akustik-gece",
    rawTitle: "Lefke Akustik Gece",
    rawDescription: "Gemikonağı sahilinde akustik performans.",
    rawDate: "2026-10-04",
    rawTime: "20:00",
    rawVenue: "Gemikonağı Sahil",
    rawDistrict: "Lefke",
    rawCategory: "concert",
    rawArtist: "Local Acoustic Collective",
    capturedAt: "2026-09-15T09:00:00.000Z",
    provenance: "FIXTURE",
    evidence: fixtureEvidence(
      "https://www.gisekibris.com/events/lefke-akustik-gece",
      "2026-09-15T09:00:00.000Z",
      '{"title":"Lefke Akustik Gece"}'
    ),
  },
  {
    sourceUrl: "https://www.gisekibris.com/events/lefke-akustik-gece",
    rawTitle: "Lefke Akustik Gece",
    rawDescription: "Gemikonağı sahilinde akustik performans.",
    rawDate: "2026-10-04",
    rawTime: "20:00",
    rawVenue: "Gemikonağı Sahil",
    rawDistrict: "Lefke",
    rawCategory: "concert",
    rawArtist: "Local Acoustic Collective",
    capturedAt: "2026-09-15T09:00:00.000Z",
    provenance: "FIXTURE",
    evidence: fixtureEvidence(
      "https://www.gisekibris.com/events/lefke-akustik-gece",
      "2026-09-15T09:00:00.000Z",
      '{"title":"Lefke Akustik Gece"}'
    ),
  },
  {
    sourceUrl: "https://www.girnebelediyesi.com/etkinlikler/girne-kultur-festivali",
    rawTitle: "Girne Kültür Festivali",
    rawDescription: "Belediye kültür festivali açılış konseri.",
    rawDate: "2026-10-18",
    rawTime: "19:30",
    rawVenue: "Girne Antik Liman",
    rawDistrict: "Girne",
    rawCategory: "festival",
    capturedAt: "2026-09-15T09:10:00.000Z",
    provenance: "FIXTURE",
    evidence: fixtureEvidence(
      "https://www.girnebelediyesi.com/etkinlikler/girne-kultur-festivali",
      "2026-09-15T09:10:00.000Z",
      '{"title":"Girne Kultur Festivali"}'
    ),
  },
  {
    sourceUrl: "https://www.emu.edu.tr/events/spring-concert",
    rawTitle: "DAÜ Bahar Konseri",
    rawDescription: "Kampüs açık hava konseri. Tarih duyurulacak.",
    rawVenue: "DAÜ Amfi Tiyatro",
    rawDistrict: "Gazimağusa",
    rawCategory: "concert",
    capturedAt: "2026-09-15T09:20:00.000Z",
    provenance: "FIXTURE",
    evidence: fixtureEvidence(
      "https://www.emu.edu.tr/events/spring-concert",
      "2026-09-15T09:20:00.000Z",
      '{"title":"DAU Bahar Konseri"}'
    ),
  },
  {
    sourceUrl: "https://www.kibrisbiletcim.com/events/lefkosa-stand-up",
    rawTitle: "Lefkoşa Stand-up Gecesi",
    rawDescription: "Merkez Lefkoşa'da stand-up gösterisi.",
    rawDate: "2026-10-11",
    rawTime: "21:00",
    rawVenue: "Nicosia City Hall",
    rawDistrict: "Lefkoşa",
    rawCategory: "standup",
    rawArtist: "KKTC Comedy Night",
    capturedAt: "2026-09-15T09:30:00.000Z",
    provenance: "FIXTURE",
    evidence: fixtureEvidence(
      "https://www.kibrisbiletcim.com/events/lefkosa-stand-up",
      "2026-09-15T09:30:00.000Z",
      '{"title":"Lefkosa Stand-up"}'
    ),
  },
];

export function seedFixtureDrafts(): SpiderIngestResult[] {
  return FIXTURE_RAW_EVENTS.map((raw) => ingestRawSpiderEvent(structuredClone(raw)));
}

export function ensureFixtureDrafts(): SpiderIngestResult[] {
  if (isOrumcekFixtureSeeded()) {
    return [];
  }
  const results = seedFixtureDrafts();
  markOrumcekFixturesSeeded();
  return results;
}

export function reloadFixtureDrafts(): SpiderIngestResult[] {
  resetOrumcekStore();
  const results = seedFixtureDrafts();
  markOrumcekFixturesSeeded();
  return results;
}
