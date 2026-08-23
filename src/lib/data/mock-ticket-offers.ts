import type { DiscoveryTicketOffer } from "@/types/event";

/**
 * Mock catalog for local/UI lab. Keys are mock event ids from `mock-events.ts`.
 * Mirrors public `event_ticket_types` / `event_ticket_zones` (014).
 */
export const MOCK_TICKET_OFFERS_BY_EVENT_ID: Record<string, DiscoveryTicketOffer[]> = {
  "1": [
    {
      id: "t1-std",
      name: "Genel Giriş",
      zoneName: "Bahçe",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 450,
      remaining: 120,
      isSoldOut: false,
    },
    {
      id: "t1-vip",
      name: "VIP",
      zoneName: "Ön Sıra",
      zoneType: "front_row",
      saleMode: "ticket_based",
      price: 850,
      remaining: 18,
      isSoldOut: false,
    },
  ],
  "2": [
    {
      id: "t2-std",
      name: "Salon",
      zoneName: "Ana Salon",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 300,
      remaining: 40,
      isSoldOut: false,
    },
  ],
  "7": [
    {
      id: "t7-std",
      name: "Standart",
      zoneName: "Salon",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 250,
      remaining: 0,
      isSoldOut: true,
    },
    {
      id: "t7-late",
      name: "Geç Giriş",
      zoneName: "Salon",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 180,
      remaining: 12,
      isSoldOut: false,
    },
  ],
  "8": [
    {
      id: "t8-a",
      name: "Koltuk A",
      zoneName: "Parter",
      zoneType: "standard",
      saleMode: "seat_based",
      price: 400,
      isSoldOut: false,
    },
    {
      id: "t8-b",
      name: "Koltuk B",
      zoneName: "Balkon",
      zoneType: "other",
      saleMode: "seat_based",
      price: 280,
      isSoldOut: false,
    },
  ],
  "10": [
    {
      id: "t10-child",
      name: "Çocuk",
      zoneName: "Salon",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 80,
      remaining: 60,
      isSoldOut: false,
    },
    {
      id: "t10-adult",
      name: "Yetişkin",
      zoneName: "Salon",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 120,
      remaining: 40,
      isSoldOut: false,
    },
  ],
  "12": [
    {
      id: "t12-day",
      name: "Günlük Bileti",
      zoneName: "Festival Alanı",
      zoneType: "standard",
      saleMode: "ticket_based",
      price: 550,
      remaining: 200,
      isSoldOut: false,
    },
    {
      id: "t12-pass",
      name: "3 Gün Pass",
      zoneName: "Festival Alanı",
      zoneType: "vip",
      saleMode: "ticket_based",
      price: 1400,
      remaining: 35,
      isSoldOut: false,
    },
  ],
};

export function getMockTicketOffers(eventId: string): DiscoveryTicketOffer[] {
  return MOCK_TICKET_OFFERS_BY_EVENT_ID[eventId] ?? [];
}
