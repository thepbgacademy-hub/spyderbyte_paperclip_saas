import { defineConfig } from "@playwright/test";

const webPort = 43190;
const baseUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  webServer: {
    command: `cmd /c "cd /d E:\\REPOS\\spyderbyte_paperclip_saas\\apps\\web && npx vite --host 127.0.0.1 --port ${webPort} --strictPort"`,
    url: baseUrl,
    reuseExistingServer: false,
    timeout: 120_000
  },
  use: {
    baseURL: baseUrl,
    navigationTimeout: 60_000
  }
});
