import { expect, type Page, test } from "@playwright/test";

async function openPage(page: Page, navKey: string, pageTestId: string) {
  await page.getByTestId(`nav-${navKey}`).click();
  await expect(page.getByTestId(pageTestId)).toBeVisible();
}

test("member connects providers by nav flow and runs a sanitized workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-shell")).toBeVisible();
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText("Wealth Factory")).toBeVisible();
  await expect(page.getByText(/Social Media Agency \|/)).toBeVisible();

  for (const [navKey, pageTestId, heading] of [
    ["workflows", "page-workflows", "Workflows"],
    ["results", "page-results", "Results"],
    ["team", "page-team", "Team"],
    ["providers", "page-providers", "Providers"],
    ["insights", "page-insights", "Insights"],
    ["package", "page-package", "Package"],
    ["files", "page-files", "Files"],
    ["assistant", "page-assistant", "Assistant"],
    ["billing", "page-billing", "Billing"],
    ["settings", "page-settings", "Settings"]
  ] as const) {
    await openPage(page, navKey, pageTestId);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await openPage(page, "providers", "page-providers");
  await page.getByLabel("Provider").selectOption("Anthropic");
  await expect(page.getByRole("button", { name: /Save reference/ })).toBeVisible();
  await page.getByLabel("API key").fill("sk-test-secret");
  await page.getByRole("button", { name: /Save reference/ }).click();
  await expect(page.getByRole("status")).toContainText("will not be shown again");
  await expect(page.getByLabel("API key")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("sk-test-secret");

  await openPage(page, "workflows", "page-workflows");
  await expect(page.getByRole("button", { name: /Start workflow/ })).toBeDisabled();

  await openPage(page, "providers", "page-providers");
  await page.getByRole("button", { name: /Connect image provider/ }).click();
  await page.getByTestId("provider-card-openai").getByRole("button", { name: /Update connection/ }).click();

  await openPage(page, "workflows", "page-workflows");
  await expect(page.getByRole("button", { name: /Start workflow/ })).toBeDisabled();

  await openPage(page, "providers", "page-providers");
  await page.getByLabel("Provider").selectOption("OpenAI");
  await page.getByLabel("API key").fill("sk-openai-secret");
  await page.getByRole("button", { name: /Save reference/ }).click();
  await expect(page.getByLabel("API key")).toHaveValue("");

  await openPage(page, "workflows", "page-workflows");
  await expect(page.getByRole("button", { name: /Start workflow/ })).toBeEnabled();
  await page.getByRole("button", { name: /Start workflow/ }).click();

  await expect(page.getByTestId("page-results")).toBeVisible();
  await expect(page.getByTestId("workflow-result")).toContainText("Workflow queued");
  await expect(page.locator("body")).not.toContainText("sk-test-secret");
});

test("temporary file retention and customer-owned storage messaging stay visible", async ({ page }) => {
  await page.goto("/");

  await openPage(page, "results", "page-results");
  await expect(page.getByText("Google Drive available to connect")).toBeVisible();
  await expect(page.getByText("Dropbox available to connect")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send to Google Drive/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Download artifact/ })).toBeVisible();
  await expect(page.getByText("Expires in 24 hours")).toBeVisible();

  await openPage(page, "files", "page-files");
  await expect(page.getByText("Campaign asset list")).toBeVisible();
  await expect(page.getByText("Expires in 18 hours")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ready to download" }).first()).toBeVisible();
  await expect(page.getByText("Reconnect storage")).toBeVisible();
});

test("settings theme changes apply globally after route navigation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.history.pushState({}, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("page-settings")).toBeVisible();
  await page.getByRole("button", { name: "Midnight", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "Midnight");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background-base").trim())
    )
    .toBe("#09111f");
  await page.getByTestId("nav-workflows").click();
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "Midnight");
});
