import { defineConfig } from "@playwright/test";

const liveBaseUrl = process.env.WF_LIVE_BASE_URL?.trim();

if (!liveBaseUrl) {
  throw new Error("WF_LIVE_BASE_URL is required for deployed Playwright verification");
}

export default defineConfig({
  testDir: "./tests/live",
  use: {
    baseURL: liveBaseUrl
  }
});
