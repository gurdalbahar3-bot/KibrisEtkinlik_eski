import { defineConfig, devices } from "@playwright/test";

import { liveE2EGateDecision, loadLocalEnv } from "./e2e/helpers/env";

loadLocalEnv();

const playwrightBaseUrlEnv = process.env.PLAYWRIGHT_BASE_URL?.trim();
// Prefer localhost over 127.0.0.1 — next-intl localized path redirects
// (e.g. /tr/etkinlikler) emit Location: http://localhost:... and loop on 127.0.0.1.
const baseURL = playwrightBaseUrlEnv || "http://localhost:3000";
const localBase =
  baseURL.startsWith("http://127.0.0.1:") ||
  baseURL.startsWith("http://localhost:");
const startLocalWebServer =
  !playwrightBaseUrlEnv &&
  localBase &&
  liveE2EGateDecision() === "run";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    // Keep traces/screenshots off so reports cannot leak env secrets.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(startLocalWebServer
    ? {
        webServer: {
          command: "npm run dev -- --hostname localhost --port 3000",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
