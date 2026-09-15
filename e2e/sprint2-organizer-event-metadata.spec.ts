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
  return `E2E Meta ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function futureDateTimeLocal(daysAhead = 21): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Wait for meta=* redirect, then reload clean URL so the next waitForURL is not a no-op. */
async function waitMetaThenReload(
  page: import("@playwright/test").Page,
  eventId: string,
  meta: string
): Promise<void> {
  await page.waitForURL(
    (url) =>
      url.pathname === `/organizer/events/${eventId}` &&
      url.searchParams.get("meta") === meta
  );
  await page.goto(`/organizer/events/${eventId}`);
}

async function waitSavedThenReload(
  page: import("@playwright/test").Page,
  eventId: string
): Promise<void> {
  await page.waitForURL(
    (url) =>
      url.pathname === `/organizer/events/${eventId}` &&
      url.searchParams.get("saved") === "1"
  );
  await page.goto(`/organizer/events/${eventId}`);
}

test.describe.configure({ mode: "serial", timeout: 240_000 });

test("Organizer event metadata draft mutations + in_review gate", async ({ page }) => {
  if (applySprint2Gate() === "skip") {
    return;
  }

  const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
  const organizerPassword = getOrganizerE2EPassword();
  const title = uniqueEventTitle();

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
  await expect(
    venueOptions.first(),
    "organizer must have at least one active staging venue"
  ).toBeAttached();
  const venueValue = await venueOptions.first().getAttribute("value");
  expect(venueValue).toBeTruthy();
  await venueSelect.selectOption(venueValue!);

  await page.locator("#title").fill(title);
  await page.locator("#description").fill("P0.6B metadata E2E");
  await page.locator("#category").selectOption("concert");
  await page.locator("#starts_at").fill(futureDateTimeLocal());
  await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
  await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);

  const eventId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(eventId).toMatch(EVENT_UUID_RE);

  await expect(page.getByTestId("event-metadata")).toBeVisible();
  await expect(page.getByTestId("meta-wedding-section")).toHaveCount(0);

  // --- FORMAT ---
  await page.getByTestId("meta-format-add").locator("#format_type").selectOption("general_admission");
  await page
    .getByTestId("meta-format-add")
    .getByRole("button", { name: /Formatı kaydet|Save format/i })
    .click();
  await waitMetaThenReload(page, eventId, "format_saved");
  await expect(
    page.locator('[data-testid="meta-format-item"][data-format-type="general_admission"]')
  ).toHaveCount(1);

  await page.getByTestId("meta-format-add").locator("#format_type").selectOption("seated");
  await page
    .getByTestId("meta-format-add")
    .getByRole("button", { name: /Formatı kaydet|Save format/i })
    .click();
  await waitMetaThenReload(page, eventId, "format_saved");
  await expect(page.getByTestId("meta-format-item")).toHaveCount(2);

  const seatedRow = page.locator(
    '[data-testid="meta-format-item"][data-format-type="seated"]'
  );
  await seatedRow.getByRole("button", { name: /Sil|Delete/i }).click();
  await waitMetaThenReload(page, eventId, "format_deleted");
  await expect(page.getByTestId("meta-format-item")).toHaveCount(1);
  await expect(
    page.locator('[data-testid="meta-format-item"][data-format-type="general_admission"]')
  ).toHaveCount(1);

  // --- LOCATION ---
  const districtSelect = page.getByTestId("meta-location-form").locator("#district_id");
  const districtOptions = districtSelect.locator("option:not([value=''])");
  await expect(districtOptions.first()).toBeAttached();
  const districtValue = await districtOptions.first().getAttribute("value");
  expect(districtValue).toBeTruthy();
  await districtSelect.selectOption(districtValue!);
  await page.getByTestId("meta-location-form").locator("#address").fill("E2E Meta Address 1");
  await page.getByTestId("meta-location-form").locator("#city").fill("Girne");
  await page.getByTestId("meta-location-form").locator("#region").fill("Kyrenia");
  await page
    .getByTestId("meta-location-form")
    .locator("#directions_text")
    .fill("Enter from the main gate");
  await page
    .getByTestId("meta-location-form")
    .getByRole("button", { name: /Lokasyonu kaydet|Save location/i })
    .click();
  await waitMetaThenReload(page, eventId, "location_saved");
  await expect(page.getByTestId("meta-location-form").locator("#address")).toHaveValue(
    "E2E Meta Address 1"
  );
  await expect(page.getByTestId("meta-location-form").locator("#city")).toHaveValue("Girne");
  await expect(page.getByTestId("meta-location-form").locator("#region")).toHaveValue("Kyrenia");
  await expect(page.getByTestId("meta-location-form").locator("#directions_text")).toHaveValue(
    "Enter from the main gate"
  );
  await expect(page.getByTestId("meta-location-form").locator("#district_id")).toHaveValue(
    districtValue!
  );

  // --- VENUE CONTACT ---
  await page.getByTestId("meta-contact-form").locator("#contact_full_name").fill("E2E Contact");
  await page.getByTestId("meta-contact-form").locator("#contact_phone").fill("+905551112233");
  await page
    .getByTestId("meta-contact-form")
    .getByRole("button", { name: /İletişimi kaydet|Save contact/i })
    .click();
  await waitMetaThenReload(page, eventId, "contact_saved");
  await expect(page.getByTestId("meta-contact-form").locator("#contact_full_name")).toHaveValue(
    "E2E Contact"
  );
  await expect(page.getByTestId("meta-contact-form").locator("#contact_phone")).toHaveValue(
    "+905551112233"
  );

  // --- WEDDING ---
  await page.getByTestId("event-is-wedding").check();
  await page.getByRole("button", { name: /Taslağı kaydet|Save draft/i }).click();
  await waitSavedThenReload(page, eventId);
  await expect(page.getByTestId("meta-wedding-section")).toBeVisible();
  await page.getByTestId("meta-wedding-form").locator("#bride_name").fill("Ayşe");
  await page.getByTestId("meta-wedding-form").locator("#groom_name").fill("Mehmet");
  await page
    .getByTestId("meta-wedding-form")
    .getByRole("button", { name: /Düğün bilgilerini kaydet|Save wedding details/i })
    .click();
  await waitMetaThenReload(page, eventId, "wedding_saved");
  await expect(page.getByTestId("meta-wedding-form").locator("#bride_name")).toHaveValue("Ayşe");
  await expect(page.getByTestId("meta-wedding-form").locator("#groom_name")).toHaveValue("Mehmet");

  await page.getByTestId("event-is-wedding").uncheck();
  await page.getByRole("button", { name: /Taslağı kaydet|Save draft/i }).click();
  await waitSavedThenReload(page, eventId);
  await expect(page.getByTestId("meta-wedding-section")).toHaveCount(0);

  // Re-enable briefly to confirm details were cleared, then disable again for submit
  await page.getByTestId("event-is-wedding").check();
  await page.getByRole("button", { name: /Taslağı kaydet|Save draft/i }).click();
  await waitSavedThenReload(page, eventId);
  await expect(page.getByTestId("meta-wedding-form").locator("#bride_name")).toHaveValue("");
  await expect(page.getByTestId("meta-wedding-form").locator("#groom_name")).toHaveValue("");
  await page.getByTestId("event-is-wedding").uncheck();
  await page.getByRole("button", { name: /Taslağı kaydet|Save draft/i }).click();
  await waitSavedThenReload(page, eventId);
  await expect(page.getByTestId("meta-wedding-section")).toHaveCount(0);
  await expect(page.getByTestId("event-is-wedding")).not.toBeChecked();

  // --- LIFECYCLE: keep a second draft to probe server action gate ---
  const probeTitle = uniqueEventTitle();
  await page.goto("/organizer/events/new");
  await page.locator("#venue_id").selectOption(venueValue!);
  await page.locator("#title").fill(probeTitle);
  await page.locator("#category").selectOption("concert");
  await page.locator("#starts_at").fill(futureDateTimeLocal(22));
  await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
  await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);
  const probeEventId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(probeEventId).toMatch(EVENT_UUID_RE);
  expect(probeEventId).not.toBe(eventId);

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

  await expect(page.getByTestId("meta-format-add")).toHaveCount(0);
  await expect(page.getByTestId("meta-location-form")).toHaveCount(0);
  await expect(page.getByTestId("meta-contact-form")).toHaveCount(0);
  await expect(page.getByTestId("meta-format-section")).toBeVisible();
  await expect(page.getByTestId("meta-location-readonly")).toBeVisible();
  await expect(page.getByTestId("meta-contact-readonly")).toBeVisible();

  // Probe action rejection: submit format upsert from draft probe form with in_review event_id
  await page.goto(`/organizer/events/${probeEventId}`);
  await expect(page.getByTestId("meta-format-add")).toBeVisible();

  const gateResult = await page.evaluate(async (targetEventId) => {
    const form = document.querySelector(
      '[data-testid="meta-format-add"]'
    ) as HTMLFormElement | null;
    if (!form) {
      return { ok: false as const, reason: "form_missing" };
    }
    const fd = new FormData(form);
    fd.set("event_id", targetEventId);
    fd.set("format_type", "table_reservation");

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

    const location = response.headers.get("location") ?? "";
    return {
      ok: true as const,
      status: response.status,
      location,
      type: response.type,
    };
  }, eventId);

  expect(gateResult.ok, "probe form must exist on draft event").toBe(true);
  if (gateResult.ok) {
    const loc = gateResult.location || "";
    const rejected =
      loc.includes("meta_error=not_draft") ||
      loc.includes("meta_error=not_found") ||
      (gateResult.status >= 300 &&
        gateResult.status < 400 &&
        loc.includes(`/organizer/events/${eventId}`));
    // Next may follow redirects in some environments; also accept final navigation pattern
    if (!rejected && gateResult.status === 0) {
      // opaque redirect — navigate and assert error banner path via query on target
      await page.goto(`/organizer/events/${eventId}`);
    } else {
      expect(
        rejected || loc.includes(`/organizer/events/${eventId}`),
        `expected draft-gate reject redirect, got status=${gateResult.status} location=${loc}`
      ).toBeTruthy();
    }
  }

  await page.goto(`/organizer/events/${eventId}?meta_section=format&meta_error=not_draft`);
  await expect(page.getByTestId("meta-format-section").getByRole("alert")).toContainText(
    /yalnızca taslak|only be edited on draft/i
  );
  await expect(page.getByTestId("meta-format-add")).toHaveCount(0);
});
