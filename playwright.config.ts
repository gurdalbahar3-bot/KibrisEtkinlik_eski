import { defineConfig, devices } from "@playwright/test";

import { liveE2EGateDecision, loadLocalEnv } from "./e2e/helpers/env";

loadLocalEnv();

const playwrightBaseUrlEnv = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = playwrightBaseUrlEnv || "http://127.0.0.1:3000";
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
          command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
