import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveDataSource } from "./config.ts";

describe("resolveDataSource", () => {
  it("A: explicit mock works in development", () => {
    assert.equal(
      resolveDataSource({ SUPABASE_DATA_SOURCE: "mock", NODE_ENV: "development" }),
      "mock"
    );
  });

  it("B: explicit supabase uses supabase", () => {
    assert.equal(
      resolveDataSource({ SUPABASE_DATA_SOURCE: "supabase", NODE_ENV: "development" }),
      "supabase"
    );
    assert.equal(
      resolveDataSource({ SUPABASE_DATA_SOURCE: "supabase", NODE_ENV: "production" }),
      "supabase"
    );
  });

  it("C: missing DATA_SOURCE does not fall to mock", () => {
    assert.equal(resolveDataSource({ NODE_ENV: "development" }), "supabase");
    assert.equal(resolveDataSource({ SUPABASE_DATA_SOURCE: "  ", NODE_ENV: "development" }), "supabase");
  });

  it("E: production never defaults to mock and rejects explicit mock", () => {
    assert.equal(resolveDataSource({ NODE_ENV: "production" }), "supabase");
    assert.equal(resolveDataSource({ SUPABASE_DATA_SOURCE: "supabase", NODE_ENV: "production" }), "supabase");
    assert.throws(
      () => resolveDataSource({ SUPABASE_DATA_SOURCE: "mock", NODE_ENV: "production" }),
      /only allowed when NODE_ENV=development/
    );
    assert.throws(
      () => resolveDataSource({ SUPABASE_DATA_SOURCE: "mock", NODE_ENV: "test" }),
      /only allowed when NODE_ENV=development/
    );
  });

  it("invalid source fails loud instead of mocking", () => {
    assert.throws(
      () => resolveDataSource({ SUPABASE_DATA_SOURCE: "memory", NODE_ENV: "development" }),
      /Invalid SUPABASE_DATA_SOURCE/
    );
  });
});
