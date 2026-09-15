/**
 * Read-only preflight for a KibrisEtkinlik-Staging logical dump.
 * Does not connect, dump, migrate, or print secret values.
 *
 * Windows (PowerShell), after setting env vars locally:
 *   npx --yes supabase --version
 *   node scripts/staging-backup-preflight.mjs
 *
 * Dump is a later step. Do not run `supabase db dump` from this script.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_CONFIRM = "KibrisEtkinlik-Staging";

const names = [
  "STAGING_PROJECT_REF",
  "STAGING_DB_URL",
  "STAGING_CONFIRM",
];

function presence(name) {
  const raw = process.env[name];
  if (raw === undefined) return "ABSENT";
  if (!String(raw).trim()) return "EMPTY";
  return "SET";
}

const backupDir = resolve(process.cwd(), "backups");
if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

console.log("target=KibrisEtkinlik-Staging");
console.log("db_writes=none");
console.log("dump=not_run");

const cli = spawnSync("npx", ["--yes", "supabase", "--version"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (cli.status !== 0) {
  console.log("supabase_cli=UNAVAILABLE");
  process.exitCode = 1;
} else {
  const version = String(cli.stdout || cli.stderr || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  console.log("supabase_cli=npx");
  console.log(`supabase_version=${version || "unknown"}`);
}

for (const name of names) {
  console.log(`${name}=${presence(name)}`);
}

const confirm = process.env.STAGING_CONFIRM?.trim();
if (confirm && confirm !== REQUIRED_CONFIRM) {
  console.log("STAGING_CONFIRM=MISMATCH");
  process.exitCode = 1;
} else if (confirm === REQUIRED_CONFIRM) {
  console.log("STAGING_CONFIRM=MATCH");
}

console.log("backup_dir=backups/ (gitignored)");
console.log("next=set env names locally, then dump later — do not paste secrets in chat");
