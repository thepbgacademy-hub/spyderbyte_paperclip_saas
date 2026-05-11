import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __WF_SERVER_SESSION__?: { role: "member" | "operator" };
  }
}

test("operator diagnostics are hidden from members and UI avoids internal terms", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Operator access required.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Paperclip");
  await expect(page.locator("body")).not.toContainText("prompt");
  await expect(page.locator("body")).not.toContainText("command");
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toHaveCount(0);
  await page.addInitScript(() => {
    window.__WF_SERVER_SESSION__ = { role: "operator" };
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Disable tenant workflows/ })).toBeVisible();
  await page.getByRole("button", { name: /Disable tenant workflows/ }).click();
  await page.getByRole("button", { name: /Connect image provider/ }).click();
  await page.getByRole("button", { name: /Queue run/ }).click();
  await expect(page.getByTestId("workflow-result")).toContainText("disabled");
});
