import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizePublicOfficialTicketUrl } from "./official-ticket-url.ts";

describe("sanitizePublicOfficialTicketUrl", () => {
  it("accepts a real https ticket URL", () => {
    assert.equal(
      sanitizePublicOfficialTicketUrl("https://tickets.example-venue.cy/event/1"),
      "https://tickets.example-venue.cy/event/1"
    );
  });

  it("rejects missing, relative, and non-http URLs", () => {
    assert.equal(sanitizePublicOfficialTicketUrl(undefined), undefined);
    assert.equal(sanitizePublicOfficialTicketUrl(""), undefined);
    assert.equal(sanitizePublicOfficialTicketUrl("/tickets"), undefined);
    assert.equal(sanitizePublicOfficialTicketUrl("javascript:alert(1)"), undefined);
  });

  it("rejects lab/fake hosts so public never gets example.com", () => {
    assert.equal(sanitizePublicOfficialTicketUrl("https://example.com/tickets/girne-yaz"), undefined);
    assert.equal(sanitizePublicOfficialTicketUrl("https://www.example.org/buy"), undefined);
    assert.equal(sanitizePublicOfficialTicketUrl("http://localhost:3000/buy"), undefined);
  });
});
