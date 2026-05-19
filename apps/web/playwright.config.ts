import { defineConfig } from "@playwright/test";

const reuseExistingServer = process.env.CI !== "true";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  webServer: {
    command: "npm run dev:web",
    url: "http://127.0.0.1:5173",
    reuseExistingServer,
    timeout: 120_000
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    navigationTimeout: 60_000
  }
});
