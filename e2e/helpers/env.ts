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

export const SPRINT2_E2E_SECRET_KEYS = [
  ...LIVE_E2E_SECRET_KEYS,
  "ORGANIZER_E2E_EMAIL",
] as const;

export const SPRINT3_E2E_SECRET_KEYS = [
  ...SPRINT2_E2E_SECRET_KEYS,
] as const;

const STAGING_SUPABASE_HOST = "nksctgxmkymmiubkrohf.supabase.co";

/** Returns missing env *names* only — never values. */
export function missingLiveE2ESecrets(): string[] {
  const missing = LIVE_E2E_SECRET_KEYS.filter((key) => !process.env[key]?.trim());
  const dataSource = process.env.SUPABASE_DATA_SOURCE?.trim();
  if (dataSource && dataSource !== "supabase" && !missing.includes("SUPABASE_DATA_SOURCE")) {
    missing.push("SUPABASE_DATA_SOURCE");
  }
  return missing;
}

export function getOrganizerE2EPassword(): string {
  return (
    process.env.ORGANIZER_E2E_PASSWORD?.trim() ||
    process.env.STAGING_SEED_TEST_PASSWORD?.trim() ||
    ""
  );
}

/** Returns missing Sprint 2 env *names* only — never values. */
export function missingSprint2E2ESecrets(): string[] {
  const missing = missingLiveE2ESecrets();
  if (!process.env.ORGANIZER_E2E_EMAIL?.trim()) {
    missing.push("ORGANIZER_E2E_EMAIL");
  }
  if (!getOrganizerE2EPassword()) {
    missing.push("ORGANIZER_E2E_PASSWORD");
  }
  return missing;
}

export function isStagingSupabaseUrl(url = process.env.SUPABASE_URL?.trim() ?? ""): boolean {
  try {
    return new URL(url).hostname === STAGING_SUPABASE_HOST;
  } catch {
    return false;
  }
}

export function liveE2EGateDecision(): "run" | "skip" | "fail" {
  const missing = missingLiveE2ESecrets();
  if (missing.length === 0) {
    return "run";
  }
  return process.env.REQUIRE_LIVE_JWT_E2E === "1" ? "fail" : "skip";
}

/**
 * Sprint 2 full lifecycle gate: SA + organizer secrets and staging-only URL.
 * Never logs secret values.
 */
export function sprint2E2EGateDecision(): "run" | "skip" | "fail" {
  const missing = missingSprint2E2ESecrets();
  const stagingOk = isStagingSupabaseUrl();
  if (missing.length === 0 && stagingOk) {
    return "run";
  }
  if (process.env.REQUIRE_LIVE_JWT_E2E === "1") {
    return "fail";
  }
  return "skip";
}

export function sprint2E2EGateFailureReason(): string {
  const missing = missingSprint2E2ESecrets();
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`secrets missing: ${missing.join(", ")}`);
  }
  if (!isStagingSupabaseUrl()) {
    parts.push("SUPABASE_URL is not staging");
  }
  return parts.join("; ") || "unavailable";
}

/** Sprint 3 customer checkout — same staging gate as Sprint 2 (+ optional service role for user seed). */
export function sprint3E2EGateDecision(): "run" | "skip" | "fail" {
  return sprint2E2EGateDecision();
}

export function sprint3E2EGateFailureReason(): string {
  return sprint2E2EGateFailureReason();
}

export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
}
