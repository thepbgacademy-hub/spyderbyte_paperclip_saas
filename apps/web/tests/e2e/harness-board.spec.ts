import { expect, test } from "@playwright/test";

test("board route shows clean persona progress and opens the drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-board").click();

  const boardPage = page.getByTestId("page-board");
  const boardSurface = page.getByTestId("harness-board");

  await expect(page).toHaveURL(/\/board(\?.*)?$/);
  await expect(boardPage).toBeVisible();
  await expect(page.getByRole("heading", { name: "Board", exact: true })).toBeVisible();
  await expect(page.getByText("Orchestrator board for clean tenant-facing progress")).toBeVisible();
  await expect(boardSurface).toContainText("CEO");
  await expect(boardSurface).toContainText("Shape the launch plan");
  await expect(boardSurface).toContainText("first three moves");
  await expect(boardSurface).toContainText("clean three-step sequence");
  await expect(boardPage).not.toContainText("Memory boundary");
  await expect(boardPage).toContainText("Completion package");
  await expect(boardPage).toContainText("Recent decisions");
  await expect(boardPage).toContainText("Follow-through");
  await expect(boardSurface).not.toContainText("Memory boundary");
  await expect(boardSurface).not.toContainText("later tenant-owned export");
  await expect(boardSurface).not.toContainText("Completion package");
  await expect(boardSurface).not.toContainText("Recent decisions");
  await expect(boardSurface).not.toContainText("Follow-through");
  await expect(boardSurface).not.toContainText("Continuity memory");
  await expect(page.locator("body")).not.toContainText("Paperclip");
  await expect(page.locator("body")).not.toContainText("prompt");
  await expect(page.locator("body")).not.toContainText("tool");

  const cardDrawer = page.getByTestId("harness-card-drawer");

  await expect(cardDrawer).toBeHidden();
  await page.getByRole("button", { name: "Open CEO card details" }).click();

  await expect(cardDrawer).toBeVisible();
  await expect(cardDrawer).toContainText("Shape the launch plan");
  await expect(cardDrawer).toContainText("Outcome");
  await expect(cardDrawer).toContainText("Continuity memory");
});
