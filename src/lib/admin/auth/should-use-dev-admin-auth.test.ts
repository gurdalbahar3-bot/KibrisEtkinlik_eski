import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveShouldUseDevAdminAuth } from "./should-use-dev-admin-auth.ts";

describe("resolveShouldUseDevAdminAuth", () => {
  it("allows the dev cookie only in local development", () => {
    assert.equal(resolveShouldUseDevAdminAuth({ NODE_ENV: "development" }), true);
  });

  it("never defaults to the dev cookie in production or staging-like envs", () => {
    assert.equal(resolveShouldUseDevAdminAuth({ NODE_ENV: "production" }), false);
    assert.equal(resolveShouldUseDevAdminAuth({ NODE_ENV: "test" }), false);
    assert.equal(
      resolveShouldUseDevAdminAuth({ NODE_ENV: "development", VERCEL_ENV: "production" }),
      false
    );
    assert.equal(
      resolveShouldUseDevAdminAuth({ NODE_ENV: "development", VERCEL_ENV: "preview" }),
      false
    );
    assert.equal(
      resolveShouldUseDevAdminAuth({ NODE_ENV: "development", ADMIN_AUTH: "supabase" }),
      false
    );
  });
});
