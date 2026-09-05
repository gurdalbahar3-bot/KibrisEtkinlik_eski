import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env.local` key=value pairs into process.env when unset.
 * Never logs values (secrets stay out of reports).
 */
export function loadLocalEnv(fileName = ".env.local"): void {
  const filePath = resolve(process.cwd(), fileName);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export const LIVE_E2E_SECRET_KEYS = [
  "SUPABASE_DATA_SOURCE",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SA_E2E_EMAIL",
  "SA_E2E_PASSWORD",
] as const;

/** Returns missing env *names* only — never values. */
export function missingLiveE2ESecrets(): string[] {
  const missing = LIVE_E2E_SECRET_KEYS.filter((key) => !process.env[key]?.trim());
  const dataSource = process.env.SUPABASE_DATA_SOURCE?.trim();
  if (dataSource && dataSource !== "supabase" && !missing.includes("SUPABASE_DATA_SOURCE")) {
    missing.push("SUPABASE_DATA_SOURCE");
  }
  return missing;
}

export function liveE2EGateDecision(): "run" | "skip" | "fail" {
  const missing = missingLiveE2ESecrets();
  if (missing.length === 0) {
    return "run";
  }
  return process.env.REQUIRE_LIVE_JWT_E2E === "1" ? "fail" : "skip";
}
