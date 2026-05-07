import { expect, test } from "@playwright/test";

test("operator diagnostics are hidden from members and UI avoids internal terms", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Operator access required.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Paperclip");
  await expect(page.locator("body")).not.toContainText("prompt");
  await expect(page.locator("body")).not.toContainText("command");
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toHaveCount(0);
  await page.goto("/?role=operator");
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toBeVisible();
  await page.getByRole("button", { name: /Disable tenant workflows/ }).click();
  await page.getByRole("button", { name: /Queue run/ }).click();
  await expect(page.getByTestId("workflow-result")).toContainText("disabled");
});
