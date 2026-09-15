import { expect, test } from "@playwright/test";

import {
  getOrganizerE2EPassword,
  loadLocalEnv,
  sprint2E2EGateDecision,
  sprint2E2EGateFailureReason,
} from "./helpers/env";

loadLocalEnv();

const VENUE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function applySprint2Gate(): "run" | "skip" {
  const decision = sprint2E2EGateDecision();
  if (decision === "run") {
    return "run";
  }
  if (decision === "fail") {
    throw new Error(`REQUIRE_LIVE_JWT_E2E=1 but ${sprint2E2EGateFailureReason()}`);
  }
  test.skip(true, `SKIPPED (${sprint2E2EGateFailureReason()})`);
  return "skip";
}

function uniqueVenueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test("Organizer venue list → edit → create inactive", async ({ page }) => {
  if (applySprint2Gate() === "skip") {
    return;
  }

  const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
  const organizerPassword = getOrganizerE2EPassword();
  const editedName = uniqueVenueName("E2E Venue Edit");
  const createdName = uniqueVenueName("E2E Venue New");

  await page.goto("/organizer/login");
  await page.locator("#email").fill(organizerEmail);
  await page.locator("#password").fill(organizerPassword);
  await page
    .locator("form")
    .filter({ has: page.locator("#email") })
    .locator('button[type="submit"]')
    .click();
  await page.waitForURL(/\/organizer\/?$/);

  await page.goto("/organizer/venues");
  await expect(page.getByRole("heading", { name: /Mekanlar|Venues/i })).toBeVisible();

  const firstVenue = page.getByTestId("venue-list-item").first();
  await expect(firstVenue, "organizer must already own at least one venue").toBeVisible();
  await firstVenue.click();
  await page.waitForURL(/\/organizer\/venues\/[0-9a-f-]{36}/);

  const existingPath = new URL(page.url()).pathname;
  const existingId = existingPath.split("/").pop() ?? "";
  expect(existingId).toMatch(VENUE_UUID_RE);

  await page.locator("#name").fill(editedName);
  await page.getByRole("button", { name: /Kaydet|Save/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === `/organizer/venues/${existingId}` &&
      url.searchParams.get("saved") === "1"
  );
  await expect(page.getByRole("status")).toContainText(/kaydedildi|saved/i);
  await expect(page.locator("#name")).toHaveValue(editedName);

  await page.goto("/organizer/venues");
  await expect(page.getByText(editedName)).toBeVisible();

  const existingStatus = await page
    .getByTestId("venue-list-item")
    .filter({ hasText: editedName })
    .getByTestId("venue-status")
    .innerText();

  await page.goto("/organizer/venues/new");
  await page.locator("#name").fill(createdName);
  await page.locator("#venue_category").selectOption("other");
  await page.locator("#city").fill("Girne");
  await page.getByRole("button", { name: /Mekan oluştur|Create venue/i }).click();
  await page.waitForURL(/\/organizer\/venues\/[0-9a-f-]{36}/);

  const createdPath = new URL(page.url()).pathname;
  const createdId = createdPath.split("/").pop() ?? "";
  expect(createdId).toMatch(VENUE_UUID_RE);
  expect(createdId).not.toBe(existingId);
  expect(page.url()).toContain("created=1");

  await expect(page.getByTestId("venue-detail-status")).toContainText(/Pasif|Inactive/i);
  await expect(page.getByTestId("venue-status-value")).toContainText(/Pasif|Inactive/i);
  await expect(page.getByTestId("venue-awaiting-sa-activation")).toContainText(
    /SA aktivasyonu|Waiting for SA/i
  );
  await expect(
    page.getByRole("button", { name: /Mekanı pasifleştir|Deactivate venue/i })
  ).toHaveCount(0);

  await page.goto("/organizer/venues");
  const newItem = page.getByTestId("venue-list-item").filter({ hasText: createdName });
  await expect(newItem).toBeVisible();
  await expect(newItem.getByTestId("venue-status")).toContainText(/Pasif|Inactive/i);
  await expect(newItem.getByTestId("venue-event-eligible")).toContainText(
    /uygun değil|Not event-ready/i
  );

  // Deactivate control only for active venues: open an active one if the edited venue is active
  if (/Aktif|Active/i.test(existingStatus)) {
    await page.getByTestId("venue-list-item").filter({ hasText: editedName }).click();
    await page.waitForURL(new RegExp(`/organizer/venues/${existingId}`));
    await expect(
      page.getByRole("button", { name: /Mekanı pasifleştir|Deactivate venue/i })
    ).toBeVisible();
    await expect(page.getByTestId("venue-awaiting-sa-activation")).toHaveCount(0);
  }
});
