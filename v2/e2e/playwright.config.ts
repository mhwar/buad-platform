import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 8788);
export const baseURL = `http://localhost:${port}`;
export const OWNER_STATE = ".auth/owner.json";

/**
 * End-to-end: the real Worker (API + built web app) on a fresh local D1, driven in Chromium
 * at desktop and phone sizes. Specs share one database, so they run one at a time and make
 * their own records with unique names.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL,
    locale: "ar-SA",
    storageState: OWNER_STATE,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bash serve.sh",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { E2E_PORT: String(port) },
  },
});
