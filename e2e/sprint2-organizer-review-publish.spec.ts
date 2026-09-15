import { expect, test } from "@playwright/test";

import {
  getOrganizerE2EPassword,
  loadLocalEnv,
  sprint2E2EGateDecision,
  sprint2E2EGateFailureReason,
} from "./helpers/env";

loadLocalEnv();

const EVENT_UUID_RE =
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

function uniqueEventTitle(): string {
  return `E2E Sprint2 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Local datetime-local value at least a few days ahead. */
function futureDateTimeLocal(daysAhead = 14): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test("Organizer create → SA approve → publish → public discovery", async ({ browser }) => {
  if (applySprint2Gate() === "skip") {
    return;
  }

  const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
  const organizerPassword = getOrganizerE2EPassword();
  const saEmail = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const saPassword = process.env.SA_E2E_PASSWORD?.trim() ?? "";
  const title = uniqueEventTitle();

  const organizerContext = await browser.newContext();
  const saContext = await browser.newContext();
  const organizerPage = await organizerContext.newPage();
  const saPage = await saContext.newPage();

  try {
    // --- Organizer: login → create draft ---
    await organizerPage.goto("/organizer/login");
    await organizerPage.locator("#email").fill(organizerEmail);
    await organizerPage.locator("#password").fill(organizerPassword);
    await organizerPage
      .locator("form")
      .filter({ has: organizerPage.locator("#email") })
      .locator('button[type="submit"]')
      .click();
    await organizerPage.waitForURL(/\/organizer\/?$/);

    await organizerPage.goto("/organizer/events/new");
    await expect(organizerPage.locator("#title")).toBeVisible();

    const venueSelect = organizerPage.locator("#venue_id");
    const venueOptions = venueSelect.locator("option:not([disabled]):not([value=''])");
    await expect(
      venueOptions.first(),
      "organizer must have at least one active staging venue"
    ).toBeAttached();
    const venueValue = await venueOptions.first().getAttribute("value");
    expect(venueValue, "venue option must have a UUID value").toBeTruthy();
    await venueSelect.selectOption(venueValue!);

    await organizerPage.locator("#title").fill(title);
    await organizerPage.locator("#description").fill("Sprint 2 E2E lifecycle event");
    await organizerPage.locator("#category").selectOption("concert");
    await organizerPage.locator("#starts_at").fill(futureDateTimeLocal());

    await organizerPage.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await organizerPage.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);

    const createdPath = new URL(organizerPage.url()).pathname;
    const eventId = createdPath.split("/").pop() ?? "";
    expect(eventId, "create must redirect to real event UUID").toMatch(EVENT_UUID_RE);
    expect(organizerPage.url()).toContain("created=1");

    await expect(organizerPage.getByRole("status")).toContainText(/taslak|draft/i);
    await expect(
      organizerPage.getByRole("button", { name: /İncelemeye Gönder|Submit for review/ })
    ).toBeVisible();
    // Draft badge (translated) — submit only renders while status === draft
    await expect(
      organizerPage.locator("main span").filter({ hasText: /Taslak|Draft/i }).first()
    ).toBeVisible();

    // --- Organizer: submit for review ---
    await organizerPage.getByRole("button", { name: /İncelemeye Gönder|Submit for review/ }).click();
    await organizerPage.waitForURL(
      (url) =>
        url.pathname === `/organizer/events/${eventId}` &&
        url.searchParams.get("submitted") === "1"
    );
    await expect(organizerPage.getByRole("status")).toContainText(/incelemeye|submitted|review/i);
    await expect(
      organizerPage.locator("main").getByText(/in_review|İncelemede|In review/i).first()
    ).toBeVisible();

    // --- SA: login in isolated context ---
    await saPage.goto("/admin/login");
    await saPage.locator("#email").fill(saEmail);
    await saPage.locator("#password").fill(saPassword);
    await saPage
      .locator("form")
      .filter({ has: saPage.locator("#email") })
      .locator('button[type="submit"]')
      .click();
    await saPage.waitForURL(
      /\/admin(?:\/(?:events|publishing|review|intake|settings|audit|distribution).*)?$/
    );

    await saPage.goto("/admin/review/events");
    const reviewLink = saPage.locator(`a[href="/admin/review/events/${eventId}"]`);
    await expect(
      reviewLink,
      "created event must appear in SA in_review queue"
    ).toBeVisible();
    await expect(saPage.getByText(title).first()).toBeVisible();
    await reviewLink.click();
    await saPage.waitForURL(new RegExp(`/admin/review/events/${eventId}`));

    await expect(saPage.locator("main h1")).toHaveText(title);
    await expect(saPage.locator("main dd").filter({ hasText: /^in_review$/i })).toBeVisible();

    await saPage.getByRole("button", { name: /Onayla|Approve/ }).click();
    await saPage.waitForURL(
      (url) =>
        url.pathname === `/admin/review/events/${eventId}` &&
        url.searchParams.get("approved") === eventId
    );
    await expect(saPage.getByRole("status")).toContainText(/onaylandı|approved/i);
    await expect(saPage.locator("main dd").filter({ hasText: /^approved$/i })).toBeVisible();

    // --- SA: existing Sprint 1 publish UI ---
    await saPage.goto(`/admin/events/${eventId}`);
    const publishForm = saPage.locator("form").filter({
      has: saPage.locator(`input[name="eventId"][value="${eventId}"]`),
    });
    const publishButton = publishForm.getByRole("button", { name: /Yayınla|Publish/ });
    await expect(publishButton).toBeVisible();
    await publishButton.click();
    await saPage.waitForURL(
      (url) =>
        url.pathname === `/admin/events/${eventId}` &&
        url.searchParams.get("published") === eventId
    );
    await expect(saPage.getByRole("status")).toContainText(/Yayınlandı|Published/);
    await expect(saPage.locator("main dd").filter({ hasText: /^published$/i })).toBeVisible();

    // --- Public discovery ---
    await saPage.goto(`/tr/etkinlikler?q=${encodeURIComponent(title)}`);
    const listingHit = saPage
      .getByRole("heading", { name: title })
      .or(saPage.getByRole("link", { name: title }));
    await expect(
      listingHit.first(),
      "published Sprint 2 event must appear on public discovery"
    ).toBeVisible();
  } finally {
    await organizerContext.close();
    await saContext.close();
  }
});
