import { expect, test } from "@playwright/test";

import { liveE2EGateDecision, loadLocalEnv, missingLiveE2ESecrets } from "./helpers/env";

loadLocalEnv();

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

test.describe.configure({ timeout: 90_000 });

test("SA publishes an approved event through the real admin UI", async ({ page }) => {
  if (applyLiveE2EGate() === "skip") {
    return;
  }

  const email = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const password = process.env.SA_E2E_PASSWORD?.trim() ?? "";
  const requestedEventId = process.env.SA_E2E_EVENT_ID?.trim();

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

  let eventId = requestedEventId ?? "";
  if (eventId) {
    await page.goto(`/admin/events/${eventId}`);
  } else {
    await page.goto("/admin/publishing");
    const queueForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="eventId"]') })
      .first();
    await expect(
      queueForm,
      "publishing queue must list a publishable event when SA_E2E_EVENT_ID is unset"
    ).toBeVisible();
    eventId = (await queueForm.locator('input[name="eventId"]').inputValue()).trim();
    await page.goto(`/admin/events/${eventId}`);
  }

  const title = (await page.locator("main h1").innerText()).trim();
  expect(title.length, "admin event detail must show a title").toBeGreaterThan(0);

  const publishForm = page.locator("form").filter({
    has: page.locator(`input[name="eventId"][value="${eventId}"]`),
  });
  const publishButton = publishForm.getByRole("button", { name: /Yayınla|Publish/ });
  await expect(publishButton, "real Publish control that posts publishEventFormAction").toBeVisible();
  await publishButton.click();

  await page.waitForURL((url) => {
    const path = url.pathname;
    const published = url.searchParams.get("published");
    return path === `/admin/events/${eventId}` && published === eventId;
  });

  await expect(page.getByRole("status")).toContainText(/Yayınlandı|Published/);
  await expect(page.locator("main dd").filter({ hasText: /^published$/i })).toBeVisible();

  await page.goto(`/tr/etkinlikler?q=${encodeURIComponent(title)}`);
  const listingHit = page.getByRole("heading", { name: title }).or(page.getByRole("link", { name: title }));
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
