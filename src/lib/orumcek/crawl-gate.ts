import {
  getSourceSeedById,
  LIVE_CRAWL_ALLOWLIST,
  PRIMARY_LIVE_CRAWL_SOURCE_ID,
} from "@/lib/orumcek/sources";
import type { LiveCrawlGateResult } from "@/lib/orumcek/types";

export const LIVE_CRAWL_FLAG = "ORUMCEK_LIVE_CRAWL";
export const LIVE_CRAWL_SOURCE_FLAG = "ORUMCEK_CRAWL_SOURCE";

export function isLiveCrawlFlagOn(): boolean {
  return process.env[LIVE_CRAWL_FLAG] === "1";
}

export function getRequestedCrawlSourceId(): string {
  const fromEnv = process.env[LIVE_CRAWL_SOURCE_FLAG]?.trim();
  return fromEnv || PRIMARY_LIVE_CRAWL_SOURCE_ID;
}

export function isSourceAllowlistedForLiveCrawl(sourceId: string): boolean {
  return (LIVE_CRAWL_ALLOWLIST as readonly string[]).includes(sourceId);
}

/**
 * Live crawl is explicit: env flag + allowlisted source.
 * Default (flag off) stays fixture/dry-run. Never implies publish.
 */
export function evaluateLiveCrawlGate(sourceId: string): LiveCrawlGateResult {
  if (!isLiveCrawlFlagOn()) {
    return {
      ok: false,
      code: "LIVE_CRAWL_DISABLED",
      sourceId,
      message:
        "Live crawl is off. Set ORUMCEK_LIVE_CRAWL=1 and an allowlisted source id (default kibris-biletcim). Fixtures/dry-run stay the default.",
    };
  }

  const seed = getSourceSeedById(sourceId);
  if (!seed) {
    return {
      ok: false,
      code: "SOURCE_UNKNOWN",
      sourceId,
      message: `Unknown Örümcek source id: ${sourceId}`,
    };
  }

  if (!seed.enabled) {
    return {
      ok: false,
      code: "SOURCE_DISABLED",
      sourceId,
      message: `Örümcek source is disabled: ${sourceId}`,
    };
  }

  if (!isSourceAllowlistedForLiveCrawl(sourceId)) {
    return {
      ok: false,
      code: "SOURCE_NOT_ALLOWLISTED",
      sourceId,
      message: `Live crawl allowlist is [${LIVE_CRAWL_ALLOWLIST.join(", ")}]. Refusing ${sourceId}.`,
    };
  }

  return { ok: true, sourceId, flagOn: true };
}

export function assertLiveCrawlAllowed(sourceId: string): void {
  const gate = evaluateLiveCrawlGate(sourceId);
  if (!gate.ok) {
    throw new Error(gate.message);
  }
}
