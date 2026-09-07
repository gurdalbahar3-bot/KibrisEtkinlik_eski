import { createClient } from "@supabase/supabase-js";
import { expect, type Page, test } from "@playwright/test";

import {
  isStagingSupabaseUrl,
  liveE2EGateDecision,
  loadLocalEnv,
  missingLiveE2ESecrets,
} from "./helpers/env";

loadLocalEnv();

const EVENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function applyLiveE2EGate(): "run" | "skip" {
  const decision = liveE2EGateDecision();

  if (decision === "run") {
    return "run";
  }

  if (decision === "fail") {
    throw new Error(
      `REQUIRE_LIVE_JWT_E2E=1 but secrets missing: ${missingLiveE2ESecrets().join(", ")}`
    );
  }

  test.skip(true, "SKIPPED (credential unavailable)");
  return "skip";
}

function publishButtonForEvent(page: Page, eventId: string) {
  const publishForm = page.locator("form").filter({
    has: page.locator(`input[name="eventId"][value="${eventId}"]`),
  });
  return publishForm.getByRole("button", { name: /Yayınla|Publish/ });
}

function futureStartsAtIso(daysAhead = 21): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString();
}

type RpcPayload = {
  success?: boolean;
  error_code?: string;
  event_id?: string;
};

function parseRpc(data: unknown): RpcPayload {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data as RpcPayload;
}

async function loginAsSa(page: Page): Promise<void> {
  const email = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const password = process.env.SA_E2E_PASSWORD?.trim() ?? "";

  await page.goto("/admin/login");
  const emailInput = page.locator("#email");
  await expect(
    emailInput,
    "ADMIN_AUTH=supabase login form is required (no dev cookie bypass)"
  ).toBeVisible();

  await emailInput.fill(email);
  await page.locator("#password").fill(password);
  await page
    .locator("form")
    .filter({ has: emailInput })
    .locator('button[type="submit"]')
    .click();
  await page.waitForURL(/\/admin(?:\/(?:events|publishing|review|intake|settings|audit|distribution).*)?$/);
}

/**
 * When publishing queue is empty, create draft → submit → approve via SA JWT + staging RPCs.
 * Publish itself remains a real admin UI assertion.
 * Does not sign out — browser SA session must stay intact.
 */
async function bootstrapApprovedEventViaSaRpc(): Promise<string> {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const anon = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  const email = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const password = process.env.SA_E2E_PASSWORD?.trim() ?? "";

  expect(isStagingSupabaseUrl(url), "Sprint 1 bootstrap requires staging SUPABASE_URL").toBe(
    true
  );

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  expect(authError, "SA JWT required for fixture bootstrap").toBeNull();

  const { data: venues, error: venueError } = await supabase
    .from("venues")
    .select("id, owner_id, status")
    .eq("status", "active")
    .limit(5);

  expect(venueError, "active venue lookup for bootstrap").toBeNull();
  expect(venues?.length, "staging must have an active venue for Sprint 1 bootstrap").toBeGreaterThan(
    0
  );

  const venue = venues![0] as { id: string; owner_id: string; status: string };
  const title = `E2E Sprint1 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: createdRaw, error: createError } = await supabase.rpc("create_event_atomic", {
    p_title: title,
    p_venue_id: venue.id,
    p_category: "concert",
    p_starts_at: futureStartsAtIso(),
    p_description: "Sprint 1 publish fixture",
    p_is_free: true,
    p_owner_id: venue.owner_id,
    p_organization_id: null,
  });
  expect(createError, "create_event_atomic bootstrap").toBeNull();
  const created = parseRpc(createdRaw);
  expect(created.success, `create_event_atomic failed: ${created.error_code ?? "unknown"}`).toBe(
    true
  );
  expect(created.event_id).toMatch(EVENT_UUID_RE);

  const eventId = created.event_id!;

  const { data: submittedRaw, error: submitError } = await supabase.rpc(
    "submit_event_for_review",
    { p_event_id: eventId }
  );
  expect(submitError, "submit_event_for_review bootstrap").toBeNull();
  const submitted = parseRpc(submittedRaw);
  expect(
    submitted.success,
    `submit_event_for_review failed: ${submitted.error_code ?? "unknown"}`
  ).toBe(true);

  const { data: approvedRaw, error: approveError } = await supabase.rpc("approve_event", {
    p_event_id: eventId,
  });
  expect(approveError, "approve_event bootstrap").toBeNull();
  const approved = parseRpc(approvedRaw);
  expect(approved.success, `approve_event failed: ${approved.error_code ?? "unknown"}`).toBe(
    true
  );

  return eventId;
}

/**
 * Prefer optional SA_E2E_EVENT_ID only when still publishable (approved|unpublished).
 * Otherwise use publishing queue; if empty, bootstrap an approved event.
 */
async function resolvePublishableEventId(page: Page): Promise<string> {
  const requestedEventId = process.env.SA_E2E_EVENT_ID?.trim() ?? "";

  if (requestedEventId) {
    expect(requestedEventId, "SA_E2E_EVENT_ID must be a UUID when set").toMatch(EVENT_UUID_RE);
    await page.goto(`/admin/events/${requestedEventId}`);
    const usable = await publishButtonForEvent(page, requestedEventId)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (usable) {
      return requestedEventId;
    }
    // Stale published (or otherwise non-publishable) fixture — ignore and continue.
  }

  await page.goto("/admin/publishing");
  const queueForm = page
    .locator("form")
    .filter({ has: page.locator('input[name="eventId"]') })
    .first();
  const queueVisible = await queueForm.isVisible({ timeout: 5_000 }).catch(() => false);
  if (queueVisible) {
    const eventId = (await queueForm.locator('input[name="eventId"]').inputValue()).trim();
    expect(eventId, "publishing queue eventId").toMatch(EVENT_UUID_RE);
    return eventId;
  }

  return bootstrapApprovedEventViaSaRpc();
}

async function openAdminEventDetail(page: Page, eventId: string): Promise<void> {
  await page.goto(`/admin/events/${eventId}`);
  if (/\/admin\/login/.test(page.url())) {
    await loginAsSa(page);
    await page.goto(`/admin/events/${eventId}`);
  }
  await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ timeout: 120_000 });

test("SA publishes an approved event through the real admin UI", async ({ page }) => {
  if (applyLiveE2EGate() === "skip") {
    return;
  }

  await loginAsSa(page);

  const eventId = await resolvePublishableEventId(page);
  await openAdminEventDetail(page, eventId);

  const title = (await page.locator("main h1").innerText()).trim();
  expect(title.length, "admin event detail must show a title").toBeGreaterThan(0);

  const publishButton = publishButtonForEvent(page, eventId);
  await expect(publishButton, "real Publish control that posts publishEventFormAction").toBeVisible();
  await publishButton.click();

  await page.waitForURL((url) => {
    const path = url.pathname;
    const published = url.searchParams.get("published");
    return path === `/admin/events/${eventId}` && published === eventId;
  });

  await expect(page.getByRole("status")).toContainText(/Yayınlandı|Published/);
  await expect(page.locator("main dd").filter({ hasText: /^published$/i })).toBeVisible();

  await page.goto(`/en/events?q=${encodeURIComponent(title)}`);
  const listingHit = page
    .getByRole("heading", { name: title })
    .or(page.getByRole("link", { name: title }));
  await expect(listingHit.first(), "published event must appear on public discovery").toBeVisible();

  const detailLink = page
    .locator('a[href*="/etkinlikler/"], a[href*="/events/"]')
    .filter({ hasText: title })
    .first();
  if ((await detailLink.count()) > 0) {
    await detailLink.click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});
