import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lowestOfferPrice,
  mapTicketTypeRowToOffer,
  stripPublicLiveSalesSignals,
} from "./ticket-offer-mapper.ts";
import type { DiscoveryTicketOffer } from "../../../types/event.ts";
import type { DbEventTicketTypeRow } from "../../../types/supabase/database.ts";

describe("public ticket mapping", () => {
  it("does not expose remaining or sold stock from zone counts", () => {
    const row = {
      id: "type-1",
      event_id: "event-1",
      zone_id: "zone-1",
      name: "Genel",
      price: 100,
      description: null,
      max_per_order: null,
      is_active: true,
      event_ticket_zones: {
        id: "zone-1",
        event_id: "event-1",
        name: "Bahçe",
        zone_type: "standard",
        sale_mode: "ticket_based",
        capacity: 100,
        reserved_count: 10,
        sold_count: 80,
        description: null,
        sort_order: 1,
        is_active: true,
      },
    } as DbEventTicketTypeRow;

    const offer = mapTicketTypeRowToOffer(row);
    assert.ok(offer);
    assert.equal(offer?.remaining, undefined);
    assert.equal(offer?.isSoldOut, false);
  });

  it("strips live-sales signals from mock catalog rows", () => {
    const offers: DiscoveryTicketOffer[] = [
      {
        id: "t1",
        name: "VIP",
        zoneName: "Ön",
        zoneType: "front_row",
        saleMode: "ticket_based",
        price: 200,
        remaining: 0,
        isSoldOut: true,
      },
    ];

    const publicOffers = stripPublicLiveSalesSignals(offers);
    assert.equal(publicOffers[0]?.remaining, undefined);
    assert.equal(publicOffers[0]?.isSoldOut, false);
    assert.equal(lowestOfferPrice(publicOffers), 200);
  });
});
