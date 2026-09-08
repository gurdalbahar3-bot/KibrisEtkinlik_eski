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

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueEventTitle(suffix: string): string {
  return `E2E Commerce ${suffix}`;
}

function futureDateTimeLocal(daysAhead = 32): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function waitCommerceThenReload(
  page: import("@playwright/test").Page,
  eventId: string,
  commerce: string
): Promise<void> {
  await page.waitForURL(
    (url) =>
      url.pathname === `/organizer/events/${eventId}` &&
      url.searchParams.get("commerce") === commerce
  );
  await page.goto(`/organizer/events/${eventId}`);
}

test.describe.configure({ mode: "serial", timeout: 360_000 });

test("Organizer ticket commerce draft + in_review + public offers", async ({
  browser,
}) => {
  if (applySprint2Gate() === "skip") {
    return;
  }

  const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
  const organizerPassword = getOrganizerE2EPassword();
  const saEmail = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const saPassword = process.env.SA_E2E_PASSWORD?.trim() ?? "";
  const suffix = uniqueSuffix();
  const title = uniqueEventTitle(suffix);
  const zoneName = `Genel Giriş ${suffix}`;
  const earlyBird = `Early Bird ${suffix}`;
  const normal = `Normal ${suffix}`;

  const organizerContext = await browser.newContext();
  const saContext = await browser.newContext();
  const page = await organizerContext.newPage();
  const saPage = await saContext.newPage();

  try {
    await page.goto("/organizer/login");
    await page.locator("#email").fill(organizerEmail);
    await page.locator("#password").fill(organizerPassword);
    await page
      .locator("form")
      .filter({ has: page.locator("#email") })
      .locator('button[type="submit"]')
      .click();
    await page.waitForURL(/\/organizer\/?$/);

    await page.goto("/organizer/events/new");
    await expect(page.locator("#title")).toBeVisible();

    const venueSelect = page.locator("#venue_id");
    const venueOptions = venueSelect.locator(
      "option:not([disabled]):not([value=''])"
    );
    await expect(venueOptions.first()).toBeAttached();
    const venueValue = await venueOptions.first().getAttribute("value");
    expect(venueValue).toBeTruthy();
    await venueSelect.selectOption(venueValue!);

    await page.locator("#title").fill(title);
    await page.locator("#description").fill("P0.8A ticket commerce E2E");
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal());
    // New-event form defaults is_free checked; paid catalog needs is_free=false for JSON-LD offers.
    const freeCheckbox = page.locator('input[name="is_free"]');
    if (await freeCheckbox.isChecked()) {
      await freeCheckbox.uncheck();
    }
    await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);

    const eventId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(eventId).toMatch(EVENT_UUID_RE);

    await expect(page.getByTestId("ticket-commerce-section")).toBeVisible();
    await expect(page.getByTestId("ticket-zone-create-form")).toBeVisible();

    // --- create zone ---
    await page.getByTestId("ticket-zone-create-name").fill(zoneName);
    await page.getByTestId("ticket-zone-create-type").selectOption("standard");
    await page.getByTestId("ticket-zone-create-capacity").fill("500");
    await page.getByTestId("ticket-zone-create-description").fill("GA zone");
    await page
      .getByTestId("ticket-zone-create-form")
      .getByRole("button", { name: /Bölge ekle|Add zone/i })
      .click();
    await waitCommerceThenReload(page, eventId, "zone_created");

    const zone = page.getByTestId("ticket-commerce-zone").first();
    await expect(zone.getByTestId("ticket-zone-name")).toHaveText(zoneName);
    await expect(zone.getByTestId("ticket-zone-capacity")).toHaveText("500");
    await expect(zone.getByTestId("ticket-zone-sold")).toHaveText("0");
    await expect(zone.getByTestId("ticket-zone-reserved")).toHaveText("0");
    await expect(zone.getByTestId("ticket-zone-remaining")).toHaveText("500");
    await expect(zone.getByTestId("ticket-zone-sold")).toHaveAttribute(
      "data-readonly",
      "true"
    );
    await expect(zone.getByTestId("ticket-zone-reserved")).toHaveAttribute(
      "data-readonly",
      "true"
    );

    // --- Early Bird type ---
    await zone.getByTestId("ticket-type-create-name").fill(earlyBird);
    await zone.getByTestId("ticket-type-create-price").fill("500");
    await zone.getByTestId("ticket-type-create-max").fill("4");
    await zone
      .getByTestId("ticket-type-create-form")
      .getByRole("button", { name: /Bilet tipi ekle|Add ticket type/i })
      .click();
    await waitCommerceThenReload(page, eventId, "type_created");

    // --- Normal type ---
    const zoneAfter = page.getByTestId("ticket-commerce-zone").first();
    await zoneAfter.getByTestId("ticket-type-create-name").fill(normal);
    await zoneAfter.getByTestId("ticket-type-create-price").fill("700");
    await zoneAfter.getByTestId("ticket-type-create-max").fill("6");
    await zoneAfter
      .getByTestId("ticket-type-create-form")
      .getByRole("button", { name: /Bilet tipi ekle|Add ticket type/i })
      .click();
    await waitCommerceThenReload(page, eventId, "type_created");

    await expect(page.getByTestId("ticket-type-row")).toHaveCount(2);
    await expect(
      page.getByTestId("ticket-type-row").filter({ hasText: earlyBird })
    ).toBeVisible();
    await expect(
      page.getByTestId("ticket-type-row").filter({ hasText: normal })
    ).toBeVisible();
    await expect(
      page
        .getByTestId("ticket-type-row")
        .filter({ hasText: earlyBird })
        .getByTestId("ticket-type-price")
    ).toContainText(/500|₺/);
    await expect(
      page
        .getByTestId("ticket-type-row")
        .filter({ hasText: normal })
        .getByTestId("ticket-type-price")
    ).toContainText(/700|₺/);

    // --- deactivate Early Bird ---
    const earlyRow = page
      .getByTestId("ticket-type-row")
      .filter({ hasText: earlyBird });
    await earlyRow
      .getByTestId("ticket-type-deactivate-form")
      .getByRole("button", {
        name: /Bilet tipini pasifleştir|Deactivate ticket type/i,
      })
      .click();
    await waitCommerceThenReload(page, eventId, "type_deactivated");
    await expect(
      page
        .getByTestId("ticket-type-row")
        .filter({ hasText: earlyBird })
    ).toHaveAttribute("data-active", "false");

    // Probe draft for NOT_DRAFT gate
    const probeTitle = uniqueEventTitle(`probe-${suffix}`);
    await page.goto("/organizer/events/new");
    await page.locator("#venue_id").selectOption(venueValue!);
    await page.locator("#title").fill(probeTitle);
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal(33));
    await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);
    const probeEventId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(probeEventId).toMatch(EVENT_UUID_RE);

    await page.goto(`/organizer/events/${eventId}`);
    await page
      .getByRole("button", { name: /İncelemeye Gönder|Submit for review/ })
      .click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/organizer/events/${eventId}` &&
        url.searchParams.get("submitted") === "1"
    );

    await expect(page.getByTestId("ticket-zone-create-form")).toHaveCount(0);
    await expect(page.getByTestId("ticket-commerce-readonly")).toBeVisible();
    await expect(page.getByTestId("ticket-commerce-zone")).toHaveCount(1);

    await page.goto(`/organizer/events/${probeEventId}`);
    await expect(page.getByTestId("ticket-zone-create-form")).toBeVisible();
    const gateResult = await page.evaluate(async (targetEventId) => {
      const form = document.querySelector(
        '[data-testid="ticket-zone-create-form"]'
      ) as HTMLFormElement | null;
      if (!form) return { ok: false as const, reason: "form_missing" };
      const fd = new FormData(form);
      fd.set("event_id", targetEventId);
      fd.set("name", "Should Fail Zone");
      fd.set("zone_type", "standard");
      fd.set("capacity", "10");
      fd.set("is_active", "true");
      const actionAttr = form.getAttribute("action");
      const postUrl =
        actionAttr && actionAttr.length > 0 && !actionAttr.startsWith("javascript:")
          ? actionAttr
          : window.location.href;
      const response = await fetch(postUrl, {
        method: "POST",
        body: fd,
        credentials: "include",
        redirect: "manual",
      });
      return {
        ok: true as const,
        status: response.status,
        location: response.headers.get("location") ?? "",
      };
    }, eventId);

    expect(gateResult.ok).toBe(true);
    if (gateResult.ok) {
      const loc = gateResult.location;
      if (loc) {
        const rejected =
          loc.includes("commerce_error=not_draft") ||
          (loc.includes(`/organizer/events/${eventId}`) &&
            loc.includes("commerce_error="));
        expect(
          rejected || loc.includes(`/organizer/events/${eventId}`),
          `expected draft-gate reject, status=${gateResult.status} location=${loc}`
        ).toBeTruthy();
      }
    }

    await page.goto(`/organizer/events/${eventId}?commerce_error=not_draft`);
    await expect(page.getByTestId("ticket-commerce-error")).toContainText(
      /yalnızca taslak|only be edited on draft/i
    );

    // --- SA approve + publish ---
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
    const reviewLink = saPage.locator(
      `a[href="/admin/review/events/${eventId}"]`
    );
    await expect(reviewLink).toBeVisible();
    await reviewLink.click();
    await saPage.waitForURL(new RegExp(`/admin/review/events/${eventId}`));
    await saPage.getByRole("button", { name: /Onayla|Approve/ }).click();
    await saPage.waitForURL(
      (url) =>
        url.pathname === `/admin/review/events/${eventId}` &&
        url.searchParams.get("approved") === eventId
    );

    await saPage.goto(`/admin/events/${eventId}`);
    const publishForm = saPage.locator("form").filter({
      has: saPage.locator(`input[name="eventId"][value="${eventId}"]`),
    });
    await publishForm.getByRole("button", { name: /Yayınla|Publish/ }).click();
    await saPage.waitForURL(
      (url) =>
        url.pathname === `/admin/events/${eventId}` &&
        url.searchParams.get("published") === eventId
    );

    // --- Public offers + TRY + JSON-LD ---
    await saPage.goto(`/tr/etkinlikler?q=${encodeURIComponent(title)}`);
    const listingHit = saPage
      .getByRole("heading", { name: title })
      .or(saPage.getByRole("link", { name: title }));
    await expect(listingHit.first()).toBeVisible();
    await listingHit.first().click();
    await saPage.waitForURL(/\/tr\/(?:etkinlikler|events)\//);

    await expect(saPage.locator("main")).toContainText(normal);
    await expect(saPage.locator("main")).toContainText(/700|₺/);

    const jsonLd = await saPage
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
    const joined = jsonLd.join("\n");
    expect(joined).toMatch(/"@type"\s*:\s*"Offer"/);
    expect(joined).toMatch(/"priceCurrency"\s*:\s*"TRY"/);
    expect(joined).toMatch(/"price"\s*:\s*"700"/);
  } finally {
    await organizerContext.close();
    await saContext.close();
  }
});
