import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPostponeEventStatus,
  canPublishEventStatus,
  canRescheduleEventStatus,
  isEventUuid,
  parseEventLifecycleRpc,
  resolveIntakePublishEventId,
} from "./admin-event-lifecycle.ts";

describe("event lifecycle RPC contract", () => {
  it("accepts only real event UUIDs", () => {
    assert.equal(isEventUuid("2f1b6c3a-4d5e-4a7b-8c9d-0e1f2a3b4c5d"), true);
    assert.equal(isEventUuid("mock-platform-006"), false);
    assert.equal(isEventUuid(""), false);
    assert.equal(resolveIntakePublishEventId("mock-platform-006"), null);
    assert.equal(
      resolveIntakePublishEventId("2f1b6c3a-4d5e-4a7b-8c9d-0e1f2a3b4c5d"),
      "2f1b6c3a-4d5e-4a7b-8c9d-0e1f2a3b4c5d"
    );
  });

  it("treats RPC success as success only when event_id is present", () => {
    const ok = parseEventLifecycleRpc({
      success: true,
      event_id: "2f1b6c3a-4d5e-4a7b-8c9d-0e1f2a3b4c5d",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.eventId, "2f1b6c3a-4d5e-4a7b-8c9d-0e1f2a3b4c5d");
    }

    const missingId = parseEventLifecycleRpc({ success: true });
    assert.equal(missingId.ok, false);
  });

  it("does not treat RPC failure as success", () => {
    const forbidden = parseEventLifecycleRpc({ success: false, error_code: "FORBIDDEN" });
    assert.equal(forbidden.ok, false);
    if (!forbidden.ok) {
      assert.equal(forbidden.errorCode, "FORBIDDEN");
    }

    const transport = parseEventLifecycleRpc(null, "network down");
    assert.equal(transport.ok, false);
    if (!transport.ok) {
      assert.equal(transport.errorCode, "RPC_ERROR");
    }
  });

  it("matches 034 status gates", () => {
    assert.equal(canPublishEventStatus("draft"), true);
    assert.equal(canPublishEventStatus("published"), false);
    assert.equal(canPostponeEventStatus("published"), true);
    assert.equal(canPostponeEventStatus("draft"), false);
    assert.equal(canRescheduleEventStatus("postponed"), true);
    assert.equal(canRescheduleEventStatus("cancelled"), false);
  });
});
