import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  getOrganizerE2EPassword,
  getSupabaseServiceRoleKey,
  loadLocalEnv,
  sprint3E2EGateDecision,
  sprint3E2EGateFailureReason,
} from "./helpers/env";

loadLocalEnv();

const EVENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function applySprint3Gate(): "run" | "skip" {
  const decision = sprint3E2EGateDecision();
  if (decision === "run") {
    return "run";
  }
  if (decision === "fail") {
    throw new Error(`REQUIRE_LIVE_JWT_E2E=1 but ${sprint3E2EGateFailureReason()}`);
  }
  test.skip(true, `SKIPPED (${sprint3E2EGateFailureReason()})`);
  return "skip";
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function futureDateTimeLocal(daysAhead = 40): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function waitCommerceThenReload(
  page: Page,
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

async function createConfirmedCustomer(
  email: string,
  password: string
): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const serviceKey = getSupabaseServiceRoleKey();
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY required for Sprint 3 customer seed (staging only)"
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "customer", full_name: "E2E Customer" },
  });

  if (error || !data.user) {
    throw new Error(`customer seed failed: ${error?.message ?? "unknown"}`);
  }
}

async function loginCustomer(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/tr/giris");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page
    .locator('[data-testid="customer-login-form"]')
    .locator('button[type="submit"]')
    .click();
  await page.waitForURL((url) => !url.pathname.includes("/giris"));
}

async function publishCommerceEvent(browser: Browser): Promise<{
  eventId: string;
  title: string;
  zoneName: string;
  typeName: string;
}> {
  const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
  const organizerPassword = getOrganizerE2EPassword();
  const saEmail = process.env.SA_E2E_EMAIL?.trim() ?? "";
  const saPassword = process.env.SA_E2E_PASSWORD?.trim() ?? "";
  const suffix = uniqueSuffix();
  const title = `E2E Checkout ${suffix}`;
  const zoneName = `Zone ${suffix}`;
  const typeName = `Type ${suffix}`;

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
    const venueSelect = page.locator("#venue_id");
    const venueOptions = venueSelect.locator(
      "option:not([disabled]):not([value=''])"
    );
    await expect(venueOptions.first()).toBeAttached();
    const venueValue = await venueOptions.first().getAttribute("value");
    expect(venueValue).toBeTruthy();
    await venueSelect.selectOption(venueValue!);

    await page.locator("#title").fill(title);
    await page.locator("#description").fill("Phase A customer checkout E2E");
    await page.locator("#category").selectOption("concert");
    await page.locator("#starts_at").fill(futureDateTimeLocal());
    const freeCheckbox = page.locator('input[name="is_free"]');
    if (await freeCheckbox.isChecked()) {
      await freeCheckbox.uncheck();
    }
    await page.getByRole("button", { name: /Taslak oluştur|Create draft/ }).click();
    await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}/);

    const eventId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(eventId).toMatch(EVENT_UUID_RE);

    await page.getByTestId("ticket-zone-create-name").fill(zoneName);
    await page.getByTestId("ticket-zone-create-type").selectOption("standard");
    await page.getByTestId("ticket-zone-create-capacity").fill("2");
    await page
      .getByTestId("ticket-zone-create-form")
      .getByRole("button", { name: /Bölge ekle|Add zone/i })
      .click();
    await waitCommerceThenReload(page, eventId, "zone_created");

    const zone = page.getByTestId("ticket-commerce-zone").first();
    await zone.getByTestId("ticket-type-create-name").fill(typeName);
    await zone.getByTestId("ticket-type-create-price").fill("250");
    await zone.getByTestId("ticket-type-create-max").fill("1");
    await zone
      .getByTestId("ticket-type-create-form")
      .getByRole("button", { name: /Bilet tipi ekle|Add ticket type/i })
      .click();
    await waitCommerceThenReload(page, eventId, "type_created");

    await page
      .getByRole("button", { name: /İncelemeye Gönder|Submit for review/ })
      .click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/organizer/events/${eventId}` &&
        url.searchParams.get("submitted") === "1"
    );

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

    return { eventId, title, zoneName, typeName };
  } finally {
    await organizerContext.close();
    await saContext.close();
  }
}

test.describe.configure({ mode: "serial", timeout: 540_000 });

test("Sprint 3 — customer auth + ticket-only checkout", async ({ browser }) => {
  if (applySprint3Gate() === "skip") {
    return;
  }

  if (!getSupabaseServiceRoleKey()) {
    test.skip(true, "SKIPPED (SUPABASE_SERVICE_ROLE_KEY missing for customer seed)");
    return;
  }

  const suffix = uniqueSuffix();
  const customerAEmail = `e2e.customer.a.${suffix}@example.com`;
  const customerBEmail = `e2e.customer.b.${suffix}@example.com`;
  const customerPassword = `CustPass!${suffix.slice(0, 8)}Aa1`;

  await createConfirmedCustomer(customerAEmail, customerPassword);
  await createConfirmedCustomer(customerBEmail, customerPassword);

  const { eventId, title, typeName } = await publishCommerceEvent(browser);

  const customerA = await browser.newContext();
  const customerB = await browser.newContext();
  const organizerCtx = await browser.newContext();
  const pageA = await customerA.newPage();
  const pageB = await customerB.newPage();
  const orgPage = await organizerCtx.newPage();

  try {
    // 1) Unauthenticated checkout → login
    await pageA.goto(`/tr/odeme?event=${eventId}`);
    await pageA.waitForURL(/\/tr\/giris/);
    expect(pageA.url()).toContain("next=");

    // 2) Organizer cannot use customer login
    const organizerEmail = process.env.ORGANIZER_E2E_EMAIL?.trim() ?? "";
    const organizerPassword = getOrganizerE2EPassword();
    await orgPage.goto("/tr/giris");
    await orgPage.locator("#email").fill(organizerEmail);
    await orgPage.locator("#password").fill(organizerPassword);
    await orgPage
      .locator('[data-testid="customer-login-form"]')
      .locator('button[type="submit"]')
      .click();
    await orgPage.waitForURL(/\/tr\/giris/);
    await expect(
      orgPage.getByText(/müşteri girişi|customer login/i)
    ).toBeVisible();

    // 3) Customer A login + public event + offer + buy CTA
    await loginCustomer(pageA, customerAEmail, customerPassword);
    await pageA.goto(`/tr/etkinlikler?q=${encodeURIComponent(title)}`);
    const listingHit = pageA
      .getByRole("heading", { name: title })
      .or(pageA.getByRole("link", { name: title }));
    await expect(listingHit.first()).toBeVisible();
    await listingHit.first().click();
    await pageA.waitForURL(/\/tr\/(?:etkinlikler|events)\//);
    await expect(pageA.locator("main")).toContainText(typeName);
    await expect(pageA.getByTestId("buy-tickets-cta")).toBeVisible();
    await pageA.getByTestId("buy-tickets-cta").click();
    await pageA.waitForURL(/\/tr\/odeme/);

    // 4) Quantity + checkout (no client price field)
    await expect(pageA.getByTestId("checkout-form")).toBeVisible();
    await expect(pageA.locator('input[name="price"]')).toHaveCount(0);
    await pageA.getByTestId("checkout-quantity").fill("1");
    await pageA.getByTestId("checkout-submit").click();
    await pageA.waitForURL(/\/tr\/hesap\/siparisler\/[0-9a-f-]{36}/);

    const orderUrl = pageA.url();
    const orderId = orderUrl.split("/").pop() ?? "";
    expect(orderId).toMatch(EVENT_UUID_RE);

    await expect(pageA.getByTestId("order-detail")).toBeVisible();
    await expect(pageA.getByTestId("order-status")).toContainText(
      /Ödeme bekleniyor|Payment pending/i
    );
    await expect(pageA.getByTestId("payment-pending-note")).toBeVisible();
    await expect(pageA.getByTestId("order-id")).toHaveText(orderId);

    // 5) Account orders list
    await pageA.goto("/tr/hesap/siparisler");
    await expect(pageA.getByTestId("orders-list")).toBeVisible();
    await expect(
      pageA.locator(`[data-testid="order-row"][data-order-id="${orderId}"]`)
    ).toBeVisible();

    // 6) Double-submit protection → resume same order
    await pageA.goto(`/tr/odeme?event=${eventId}`);
    await pageA.getByTestId("checkout-quantity").fill("1");
    await pageA.getByTestId("checkout-submit").click();
    await pageA.waitForURL(/\/tr\/hesap\/siparisler\/[0-9a-f-]{36}/);
    expect(pageA.url()).toContain(orderId);

    // 7) Customer B cannot see Customer A order
    await loginCustomer(pageB, customerBEmail, customerPassword);
    await pageB.goto(`/tr/hesap/siparisler/${orderId}`);
    await expect(pageB.getByTestId("order-detail")).toHaveCount(0);
    await expect(pageB.locator("body")).toContainText(/404|bulunamadı|Not Found/i);

    await pageB.goto("/tr/hesap/siparisler");
    await expect(
      pageB.locator(`[data-testid="order-row"][data-order-id="${orderId}"]`)
    ).toHaveCount(0);

    // 8) Capacity: A holds 1 of 2; B takes 1; C exceeds
    await pageB.goto(`/tr/odeme?event=${eventId}`);
    await pageB.getByTestId("checkout-quantity").fill("1");
    await pageB.getByTestId("checkout-submit").click();
    await pageB.waitForURL(/\/tr\/hesap\/siparisler\/[0-9a-f-]{36}/);

    const customerCEmail = `e2e.customer.c.${suffix}@example.com`;
    await createConfirmedCustomer(customerCEmail, customerPassword);
    const customerC = await browser.newContext();
    const pageC = await customerC.newPage();
    try {
      await loginCustomer(pageC, customerCEmail, customerPassword);
      await pageC.goto(`/tr/odeme?event=${eventId}`);
      // Capacity fully held → UI shows sold-out (remaining 0) or RPC capacity_exceeded.
      const soldOut = pageC.getByTestId("checkout-sold-out");
      const form = pageC.getByTestId("checkout-form");
      await expect(soldOut.or(form)).toBeVisible({ timeout: 30_000 });
      if (await soldOut.isVisible()) {
        await expect(soldOut).toContainText(/Kapasite|capacity|Not enough/i);
      } else {
        await pageC.getByTestId("checkout-quantity").fill("1");
        await pageC.getByTestId("checkout-submit").click();
        await pageC.waitForURL(/error=capacity_exceeded/, { timeout: 60_000 });
        await expect(pageC.getByTestId("checkout-error")).toBeVisible();
        await expect(pageC.getByTestId("checkout-error")).toContainText(
          /Kapasite|capacity|Not enough/i
        );
      }
    } finally {
      await customerC.close();
    }

    // Signup UI reachable (logged-out context)
    const signupCtx = await browser.newContext();
    const signupPage = await signupCtx.newPage();
    try {
      await signupPage.goto("/tr/kayit");
      await expect(signupPage.getByTestId("customer-signup-form")).toBeVisible();
    } finally {
      await signupCtx.close();
    }
  } finally {
    await customerA.close();
    await customerB.close();
    await organizerCtx.close();
  }
});
