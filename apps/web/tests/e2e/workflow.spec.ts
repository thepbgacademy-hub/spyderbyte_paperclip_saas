import { expect, test } from "@playwright/test";

test("member connects OpenAI and runs a sanitized workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wealth Factory workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Social Media Agency" })).toBeVisible();
  await page.getByLabel("API key").fill("sk-test-secret");
  await page.getByRole("button", { name: /Save reference/ }).click();
  await expect(page.getByRole("status")).toContainText("will not be shown again");
  await expect(page.getByLabel("API key")).toHaveValue("");
  await expect(page.getByRole("button", { name: /Queue run/ })).toBeDisabled();
  await page.getByRole("button", { name: /Connect image provider/ }).click();
  await expect(page.getByText("Package provider connected")).toBeVisible();
  await page.getByRole("button", { name: /Queue run/ }).click();
  await expect(page.getByTestId("workflow-result")).toContainText("Workflow queued");
  await expect(page.locator("body")).not.toContainText("sk-test-secret");
});

test("generated files are presented as temporary downloads with customer storage options", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("expire after 24 hours")).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect Google Drive/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect Dropbox/ })).toBeVisible();
});
