/**
 * Post-055 migration files accepted by current project policy.
 * Scope asserts must reject ANY other 056+ filename (unknown / accidental).
 * Does NOT authorize AS-IS replay of 051–055.
 */
export const ALLOWED_POST_055_MIGRATION_FILES = new Set([
  "056_events_official_ticket_url.sql",
  "057_staging_publishable_statuses.sql",
  "058_staging_event_review_lifecycle.sql",
  "059_staging_set_event_official_ticket_url.sql",
  "060_staging_artist_write_rpcs.sql",
  "061_staging_commerce_security_hardening.sql",
  "062_staging_checkout_phase_a.sql",
  "063_staging_payment_foundation.sql",
  "064_mvp_release_security_hardening.sql",
  "065_mvp_qr_expiry_hardening.sql",
]);

/**
 * @param {{ name: string, n: number }[]} numbered
 * @returns {{ name: string, n: number }[]}
 */
export function unexpectedPost055Migrations(numbered) {
  return numbered.filter(
    (row) => row.n >= 56 && !ALLOWED_POST_055_MIGRATION_FILES.has(row.name)
  );
}

/**
 * @param {{ name: string, n: number }[]} numbered
 * @param {import("node:assert/strict")} assert
 */
export function assertPost055Allowlist(numbered, assert) {
  const unexpected = unexpectedPost055Migrations(numbered);
  assert.equal(
    unexpected.length,
    0,
    `unexpected post-055 migration (not on project allowlist): ${unexpected
      .map((row) => row.name)
      .join(", ")}`
  );
}
