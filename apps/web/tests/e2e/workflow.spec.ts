import { expect, test } from "@playwright/test";

test("member connects OpenAI and runs a sanitized workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Secure workflow launch" })).toBeVisible();
  await page.getByLabel("API key").fill("sk-test-secret");
  await page.getByRole("button", { name: /Save reference/ }).click();
  await expect(page.getByRole("status")).toContainText("will not be shown again");
  await expect(page.getByLabel("API key")).toHaveValue("");
  await page.getByRole("button", { name: /Queue run/ }).click();
  await expect(page.getByTestId("workflow-result")).toContainText("Workflow queued");
  await expect(page.locator("body")).not.toContainText("sk-test-secret");
});
