import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __WF_SERVER_SESSION__?: { role: "member" | "operator" };
  }
}

test("customer UI keeps operator controls hidden from members and avoids internal terms", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-shell")).toBeVisible();
  await expect(page.getByLabel("Role")).toContainText("Member");
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Paperclip");
  await expect(page.locator("body")).not.toContainText("prompt");
  await expect(page.locator("body")).not.toContainText("command");
  await expect(page.locator("body")).not.toContainText("run console");
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toHaveCount(0);

  await page.getByTestId("nav-results").click();
  await expect(page.getByTestId("page-results")).toBeVisible();
  await expect(page.getByText("No prompts, tool traces, or backend activity are exposed here.")).toBeVisible();
});

test("operator can pause workflows while members cannot see pause controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toHaveCount(0);

  await page.addInitScript(() => {
    window.__WF_SERVER_SESSION__ = { role: "operator" };
  });
  await page.goto("/");

  await expect(page.getByLabel("Role")).toContainText("Operator");
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toBeVisible();
  await page.getByRole("button", { name: /Disable tenant workflows/ }).click();
  await expect(page.getByRole("button", { name: /Enable tenant workflows/ })).toBeVisible();

  await page.getByTestId("nav-providers").click();
  await expect(page.getByTestId("page-providers")).toBeVisible();
  await page.getByLabel("API key").fill("sk-operator-secret");
  await page.getByRole("button", { name: /Save reference/ }).click();
  await expect(page.getByLabel("API key")).toHaveValue("");
  await page.getByRole("button", { name: /Connect image provider/ }).click();

  await page.getByTestId("nav-workflows").click();
  await expect(page.getByTestId("page-workflows")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start workflow/ })).toBeDisabled();
  await expect(page.getByText("Workflow launches are paused for this tenant right now.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sk-operator-secret");
});

test("hidden future shell routes stay inaccessible by default", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.history.pushState({}, "", "/assistant-studio");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(page.getByRole("link", { name: "Assistant Studio" })).toHaveCount(0);
});
