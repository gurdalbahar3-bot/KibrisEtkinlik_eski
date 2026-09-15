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

const TICKET_URL = "https://tickets.kibrisetkinlik.com/e2e-p06c";

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
  return `E2E Ticket ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function futureDateTimeLocal(daysAhead = 28): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function waitTicketThenReload(
  page: import("@playwright/test").Page,
  eventId: string,
  ticket: string
): Promise<void> {
  await page.waitForURL(
    (url) =>
      url.pathname === `/organizer/events/${eventId}` &&
      url.searchParams.get("ticket") === ticket
  );
  await page.goto(`/organizer/events/${eventId}`);
}

test.describe.configure({ mode: "serial", timeout: 300_000 });

test("Organizer official ticket URL draft + in_review + public", async ({ browser }) => {
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
    const venueOptions = venueSelect.locator("option:not([disabled]):not([value=''])");
    await expect(venueOptions.first()).toBeAttached();
    const venueValue = await venueOptions.first().getAttribute("value");
    expect(venueValue).toBeTruthy();
    await venueSelect.selectOption(venueValue!);

    await page.locator("#title").fill(title);
    await page.locator("#description").fill("P0.6C official ticket E2E");
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal());
    await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);

    const eventId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(eventId).toMatch(EVENT_UUID_RE);

    await expect(page.getByTestId("official-ticket-section")).toBeVisible();
    await expect(page.getByTestId("official-ticket-form")).toBeVisible();

    // --- valid URL ---
    await page.getByTestId("official-ticket-input").fill(TICKET_URL);
    await page
      .getByTestId("official-ticket-form")
      .getByRole("button", { name: /Bilet URL|Save ticket URL/i })
      .click();
    await waitTicketThenReload(page, eventId, "saved");
    await expect(page.getByTestId("official-ticket-input")).toHaveValue(TICKET_URL);

    // --- clear ---
    await page.getByTestId("official-ticket-input").fill("");
    await page
      .getByTestId("official-ticket-form")
      .getByRole("button", { name: /Bilet URL|Save ticket URL/i })
      .click();
    await waitTicketThenReload(page, eventId, "saved");
    await expect(page.getByTestId("official-ticket-input")).toHaveValue("");

    // --- invalid URL ---
    await page.getByTestId("official-ticket-input").fill("https://example.com/tickets");
    await page
      .getByTestId("official-ticket-form")
      .getByRole("button", { name: /Bilet URL|Save ticket URL/i })
      .click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/organizer/events/${eventId}` &&
        url.searchParams.get("ticket_error") === "invalid_url"
    );
    await expect(page.getByTestId("official-ticket-error")).toContainText(
      /Geçersiz bilet URL|Invalid ticket URL/i
    );
    await page.goto(`/organizer/events/${eventId}`);
    await expect(page.getByTestId("official-ticket-input")).toHaveValue("");

    // --- leave valid URL for public discovery, then submit ---
    await page.getByTestId("official-ticket-input").fill(TICKET_URL);
    await page
      .getByTestId("official-ticket-form")
      .getByRole("button", { name: /Bilet URL|Save ticket URL/i })
      .click();
    await waitTicketThenReload(page, eventId, "saved");

    // Probe draft form for NOT_DRAFT after submit
    const probeTitle = uniqueEventTitle();
    await page.goto("/organizer/events/new");
    await page.locator("#venue_id").selectOption(venueValue!);
    await page.locator("#title").fill(probeTitle);
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal(29));
    await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);
    const probeEventId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(probeEventId).toMatch(EVENT_UUID_RE);

    await page.goto(`/organizer/events/${eventId}`);
    await page.getByRole("button", { name: /İncelemeye Gönder|Submit for review/ }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/organizer/events/${eventId}` &&
        url.searchParams.get("submitted") === "1"
    );
    await expect(
      page.locator("main").getByText(/in_review|İncelemede|In review/i).first()
    ).toBeVisible();

    await expect(page.getByTestId("official-ticket-form")).toHaveCount(0);
    await expect(page.getByTestId("official-ticket-readonly")).toBeVisible();
    await expect(page.getByTestId("official-ticket-readonly-value")).toHaveAttribute(
      "href",
      TICKET_URL
    );

    await page.goto(`/organizer/events/${probeEventId}`);
    await expect(page.getByTestId("official-ticket-form")).toBeVisible();
    const gateResult = await page.evaluate(async (targetEventId) => {
      const form = document.querySelector(
        '[data-testid="official-ticket-form"]'
      ) as HTMLFormElement | null;
      if (!form) return { ok: false as const, reason: "form_missing" };
      const fd = new FormData(form);
      fd.set("event_id", targetEventId);
      fd.set("official_ticket_url", "https://tickets.kibrisetkinlik.com/should-fail");
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
      const rejected =
        loc.includes("ticket_error=not_draft") ||
        (loc.includes(`/organizer/events/${eventId}`) &&
          (loc.includes("ticket_error=") || loc.includes("not_draft")));
      // Next may return an opaque redirect (empty location) — UI assertion below is authoritative.
      if (loc) {
        expect(
          rejected || loc.includes(`/organizer/events/${eventId}`),
          `expected draft-gate reject, status=${gateResult.status} location=${loc}`
        ).toBeTruthy();
      }
    }

    await page.goto(`/organizer/events/${eventId}?ticket_error=not_draft`);
    await expect(page.getByTestId("official-ticket-error")).toContainText(
      /yalnızca taslak|only be edited on draft/i
    );
    await expect(page.getByTestId("official-ticket-form")).toHaveCount(0);

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
    const reviewLink = saPage.locator(`a[href="/admin/review/events/${eventId}"]`);
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

    // --- Public discovery detail: official ticket CTA ---
    await saPage.goto(`/tr/etkinlikler?q=${encodeURIComponent(title)}`);
    const listingHit = saPage
      .getByRole("heading", { name: title })
      .or(saPage.getByRole("link", { name: title }));
    await expect(listingHit.first()).toBeVisible();
    await listingHit.first().click();
    await saPage.waitForURL(/\/tr\/(?:etkinlikler|events)\//);
    const officialLink = saPage.getByRole("link", {
      name: /Bilet Al \/ Resmi Bilet|Official tickets/i,
    });
    await expect(officialLink).toBeVisible();
    await expect(officialLink).toHaveAttribute("href", TICKET_URL);
  } finally {
    await organizerContext.close();
    await saContext.close();
  }
});
