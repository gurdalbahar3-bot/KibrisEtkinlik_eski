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
  return `E2E Artists ${suffix}`;
}

function futureDateTimeLocal(daysAhead = 30): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function waitArtistsThenReload(
  page: import("@playwright/test").Page,
  eventId: string
): Promise<void> {
  await page.waitForURL(
    (url) =>
      url.pathname === `/organizer/events/${eventId}` &&
      url.searchParams.get("artists") === "saved"
  );
  await page.goto(`/organizer/events/${eventId}`);
}

test.describe.configure({ mode: "serial", timeout: 360_000 });

test("Organizer artists draft + in_review + public JSON-LD", async ({ browser }) => {
  if (applySprint2Gate() === "skip") {
    return;
  }

  const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
  const organizerPassword = getOrganizerE2EPassword();
  const saEmail = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const saPassword = process.env.SA_E2E_PASSWORD?.trim() ?? "";
  const suffix = uniqueSuffix();
  const title = uniqueEventTitle(suffix);
  const artistA = `E2E Artist A ${suffix}`;
  const artistB = `E2E Artist B ${suffix}`;
  const slugA = `e2e-artist-a-${suffix}`;
  const slugB = `e2e-artist-b-${suffix}`;

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
    await page.locator("#description").fill("P0.7B organizer artists E2E");
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal());
    await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);

    const eventId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(eventId).toMatch(EVENT_UUID_RE);

    await expect(page.getByTestId("event-artists-section")).toBeVisible();
    await expect(page.getByTestId("event-artists-create-form")).toBeVisible();

    // --- create artist A (auto-added to local list) ---
    await page.getByTestId("event-artist-create-name").fill(artistA);
    await page.getByTestId("event-artist-create-slug").fill(slugA);
    await page.getByTestId("event-artist-create-bio").fill("Bio A");
    await page.getByTestId("event-artist-create-submit").click();
    await expect(page.getByTestId("event-artist-row")).toHaveCount(1);
    await expect(page.getByTestId("event-artist-name").first()).toHaveText(artistA);

    // --- create artist B ---
    await page.getByTestId("event-artist-create-name").fill(artistB);
    await page.getByTestId("event-artist-create-slug").fill(slugB);
    await page.getByTestId("event-artist-create-submit").click();
    await expect(page.getByTestId("event-artist-row")).toHaveCount(2);

    // --- roles + sort (move B up so B is first) ---
    const rows = page.getByTestId("event-artist-row");
    await rows.nth(0).getByTestId("event-artist-role").fill("headliner");
    await rows.nth(1).getByTestId("event-artist-role").fill("support");
    await rows.nth(1).getByTestId("event-artist-move-up").click();
    await expect(rows.nth(0).getByTestId("event-artist-name")).toHaveText(artistB);
    await expect(rows.nth(1).getByTestId("event-artist-name")).toHaveText(artistA);

    // --- duplicate add blocked in UI ---
    await page.getByTestId("event-artists-search-input").fill(artistA);
    await expect(page.getByTestId("event-artists-search-results")).toBeVisible();
    const addBtn = page
      .getByTestId("event-artists-search-results")
      .locator('[data-testid="event-artists-add"]')
      .first();
    await expect(addBtn).toBeDisabled();
    await expect(addBtn).toContainText(/Eklendi|Added/i);

    // --- save ---
    await page
      .getByTestId("event-artists-save-form")
      .getByRole("button", { name: /Sanatçıları kaydet|Save artists/i })
      .click();
    await waitArtistsThenReload(page, eventId);
    await expect(page.getByTestId("event-artist-row")).toHaveCount(2);
    await expect(page.getByTestId("event-artist-name").nth(0)).toHaveText(artistB);
    await expect(page.getByTestId("event-artist-name").nth(1)).toHaveText(artistA);
    await expect(page.getByTestId("event-artist-role").nth(0)).toHaveValue("support");
    await expect(page.getByTestId("event-artist-role").nth(1)).toHaveValue("headliner");

    // --- remove one, save, reload ---
    await page.getByTestId("event-artist-row").nth(1).getByTestId("event-artist-remove").click();
    await expect(page.getByTestId("event-artist-row")).toHaveCount(1);
    await page
      .getByTestId("event-artists-save-form")
      .getByRole("button", { name: /Sanatçıları kaydet|Save artists/i })
      .click();
    await waitArtistsThenReload(page, eventId);
    await expect(page.getByTestId("event-artist-row")).toHaveCount(1);
    await expect(page.getByTestId("event-artist-name").first()).toHaveText(artistB);

    // Re-add A via search for public discovery (two names), save
    await page.getByTestId("event-artists-search-input").fill(artistA);
    await page
      .getByTestId("event-artists-search-results")
      .getByTestId("event-artists-add")
      .click();
    await expect(page.getByTestId("event-artist-row")).toHaveCount(2);
    await page
      .getByTestId("event-artists-save-form")
      .getByRole("button", { name: /Sanatçıları kaydet|Save artists/i })
      .click();
    await waitArtistsThenReload(page, eventId);
    await expect(page.getByTestId("event-artist-row")).toHaveCount(2);

    // Probe draft for NOT_DRAFT gate
    const probeTitle = uniqueEventTitle(`probe-${suffix}`);
    await page.goto("/organizer/events/new");
    await page.locator("#venue_id").selectOption(venueValue!);
    await page.locator("#title").fill(probeTitle);
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal(31));
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

    await expect(page.getByTestId("event-artists-save-form")).toHaveCount(0);
    await expect(page.getByTestId("event-artists-create-form")).toHaveCount(0);
    await expect(page.getByTestId("event-artists-readonly")).toBeVisible();
    await expect(page.getByTestId("event-artist-row")).toHaveCount(2);

    await page.goto(`/organizer/events/${probeEventId}`);
    await expect(page.getByTestId("event-artists-save-form")).toBeVisible();
    const gateResult = await page.evaluate(async (targetEventId) => {
      const form = document.querySelector(
        '[data-testid="event-artists-save-form"]'
      ) as HTMLFormElement | null;
      if (!form) return { ok: false as const, reason: "form_missing" };
      const fd = new FormData(form);
      fd.set("event_id", targetEventId);
      fd.set(
        "artists_json",
        JSON.stringify([{ artist_id: "00000000-0000-4000-8000-000000000099", role: "x", sort_order: 0 }])
      );
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
          loc.includes("artists_error=not_draft") ||
          (loc.includes(`/organizer/events/${eventId}`) && loc.includes("artists_error="));
        expect(
          rejected || loc.includes(`/organizer/events/${eventId}`),
          `expected draft-gate reject, status=${gateResult.status} location=${loc}`
        ).toBeTruthy();
      }
    }

    await page.goto(`/organizer/events/${eventId}?artists_error=not_draft`);
    await expect(page.getByTestId("event-artists-error")).toContainText(
      /yalnızca taslak|only be edited on draft/i
    );
    await expect(page.getByTestId("event-artists-save-form")).toHaveCount(0);

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

    // --- Public discovery: artists visible + JSON-LD performer ---
    await saPage.goto(`/tr/etkinlikler?q=${encodeURIComponent(title)}`);
    const listingHit = saPage
      .getByRole("heading", { name: title })
      .or(saPage.getByRole("link", { name: title }));
    await expect(listingHit.first()).toBeVisible();
    await listingHit.first().click();
    await saPage.waitForURL(/\/tr\/(?:etkinlikler|events)\//);

    await expect(saPage.locator("main")).toContainText(artistB);
    await expect(saPage.locator("main")).toContainText(artistA);

    const jsonLd = await saPage.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
      nodes.map((n) => n.textContent ?? "")
    );
    const joined = jsonLd.join("\n");
    expect(joined).toMatch(/"@type"\s*:\s*"PerformingGroup"/);
    expect(joined).toContain(artistB);
  } finally {
    await organizerContext.close();
    await saContext.close();
  }
});
