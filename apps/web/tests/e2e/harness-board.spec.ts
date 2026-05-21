import { expect, test } from "@playwright/test";

test("board route shows clean persona progress and opens the drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-board").click();

  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByTestId("page-board")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Board", exact: true })).toBeVisible();
  await expect(page.getByTestId("harness-board")).toContainText("CEO");
  await expect(page.locator("body")).not.toContainText("Paperclip");
  await expect(page.locator("body")).not.toContainText("prompt");
  await expect(page.locator("body")).not.toContainText("tool");

  await page.getByRole("button", { name: "Open CEO card details" }).click();

  await expect(page.getByTestId("harness-card-drawer")).toBeVisible();
  await expect(page.getByTestId("harness-card-drawer")).toContainText("Shape the launch plan");
  await expect(page.getByTestId("harness-card-drawer")).toContainText("Outcome");
});
