import { expect, test } from "@playwright/test";

const allowedOrigin = process.env.WF_LIVE_ALLOWED_ORIGIN ?? "https://www.spyderbyte.cloud";
const deniedOrigin = process.env.WF_LIVE_DENIED_ORIGIN ?? "https://evil.example";
const shellPath = process.env.WF_LIVE_SHELL_PATH ?? "/";
const sessionCookieName = process.env.WF_LIVE_SESSION_COOKIE_NAME ?? "wf_portal_session";
const sessionCookieValue = process.env.WF_LIVE_SESSION_COOKIE_VALUE ?? "";
const expectedUnauthShellStatuses = parseStatuses(process.env.WF_LIVE_EXPECT_UNAUTH_SHELL_STATUSES ?? "401,403");
const forbiddenText = /paperclip|prompt|skill|command|tool call|raw activity|internal log|service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i;

test("live api dashboard rejects unauthenticated browser-origin requests safely", async ({ request }) => {
  const response = await request.get("/api/dashboard", {
    headers: { origin: allowedOrigin }
  });
  const body = await response.text();

  expect(response.status()).toBe(401);
  expect(response.headers()["access-control-allow-origin"]).toBe(allowedOrigin);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(body).toContain("unauthorized");
  expect(body).not.toMatch(forbiddenText);
});

test("live api rejects denied browser origins cleanly", async ({ request }) => {
  const response = await request.get("/api/dashboard", {
    headers: { origin: deniedOrigin }
  });
  const body = await response.text();

  expect(response.status()).toBe(403);
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(body).toContain("request_rejected");
  expect(body).not.toMatch(forbiddenText);
});

test("live top-level browser navigation hits the unauthenticated shell gate safely", async ({ page, baseURL }) => {
  const targetUrl = new URL(shellPath, requiredBaseUrl(baseURL)).toString();
  const response = await page.goto(targetUrl, {
    waitUntil: "domcontentloaded"
  });
  const body = await response?.text();

  expect(response).not.toBeNull();
  expect(expectedUnauthShellStatuses).toContain(response!.status());
  expect(response!.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response!.headers()["content-security-policy"] ?? "").toContain("default-src 'self'");
  expect(response!.headers()["content-type"] ?? "").toContain("application/json");
  expect(body ?? "").toMatch(/"code":"(unauthorized|request_rejected)"/);
  expect(body ?? "").not.toMatch(forbiddenText);
});

test("live authenticated shell serves bootstrap and app assets", async ({ context, page, baseURL }) => {
  test.skip(!sessionCookieValue, "WF_LIVE_SESSION_COOKIE_VALUE is required for authenticated live shell verification");

  const expectedAssetBaseUrl = process.env.WF_LIVE_EXPECT_ASSET_BASE_URL ?? `${requiredBaseUrl(baseURL).replace(/\/$/, "")}/app-assets/`;
  await context.addCookies([
    {
      name: sessionCookieName,
      value: sessionCookieValue,
      url: requiredBaseUrl(baseURL)
    }
  ]);

  const targetUrl = new URL(shellPath, requiredBaseUrl(baseURL)).toString();
  const response = await page.goto(targetUrl, {
    waitUntil: "domcontentloaded"
  });

  await expect(page.locator("#wf-dashboard-bootstrap")).toBeVisible();
  await expect(page.locator("script[type='module']")).toHaveAttribute("src", new RegExp(`^${escapeRegExp(expectedAssetBaseUrl)}`));
  await expect(page.getByTestId("dashboard-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(forbiddenText);
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
});

function parseStatuses(input: string) {
  return input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 100 && value <= 599);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requiredBaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error("WF_LIVE_BASE_URL is required");
  }
  return value;
}
